//! Picks the daily location: weighted by fame tier, with variety rules so
//! consecutive days don't cluster. Pure functions over the template pool, so
//! it can be unit-tested and simulated without a database.

use std::{
    collections::HashMap,
    hash::{BuildHasher, RandomState},
    time::SystemTime,
};

use crate::{calc::distance_km, hints};

/// Chance of each tier (1 iconic, 2 well-known, 3 deep cut), in percent.
/// A tier with nothing left gives its share to the others.
pub const TIER_WEIGHTS: [(u8, u32); 3] = [(1, 50), (2, 35), (3, 15)];

/// How many past challenges the variety rules look at.
pub const RECENT_LIMIT: usize = 90;
const CONTINENT_DAYS: usize = 2;
const COUNTRY_DAYS: usize = 30;
const NEARBY_KM: f64 = 50.0;

/// A past daily challenge. Lists of these are newest first.
pub struct Past {
    pub name: String,
    pub country: String,
    pub lat: f64,
    pub lng: f64,
}

/// Variety rules, least important first. When nothing satisfies them all, the
/// pick breaks the least important ones it can.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Rule {
    /// Not the same type (city/landmark/natural) three days running.
    NoTypeStreak,
    /// Not a continent used in the last `CONTINENT_DAYS` days.
    NewContinent,
    /// Not a country used in the last `COUNTRY_DAYS` days.
    NewCountry,
    /// Not within `NEARBY_KM` of anything in the last `RECENT_LIMIT` days.
    NotNearby,
}
const RULES: [Rule; 4] = [Rule::NoTypeStreak, Rule::NewContinent, Rule::NewCountry, Rule::NotNearby];

/// Small seedable PRNG (SplitMix64); avoids a dependency for one pick a day.
pub struct Rng(u64);

impl Rng {
    pub fn from_entropy() -> Self {
        Self(RandomState::new().hash_one(SystemTime::now()))
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn seeded(seed: u64) -> Self {
        Self(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n as u64) as usize
    }
}

/// What the rules need to know about recent days.
struct Context<'a> {
    streak_type: Option<&'a str>,
    continents: Vec<&'static str>,
    countries: Vec<&'a str>,
    recent: &'a [Past],
}

impl<'a> Context<'a> {
    fn new(recent: &'a [Past], kinds: &HashMap<(&str, &str), &'a str>) -> Self {
        let kind_of = |p: &Past| kinds.get(&(p.name.as_str(), p.country.as_str())).copied();
        let streak_type = match recent {
            [a, b, ..] => kind_of(a).filter(|k| kind_of(b) == Some(*k)),
            _ => None,
        };
        Self {
            streak_type,
            continents: recent
                .iter()
                .take(CONTINENT_DAYS)
                .filter_map(|p| hints::continent_at(&p.country, p.lat, p.lng))
                .collect(),
            countries: recent.iter().take(COUNTRY_DAYS).map(|p| p.country.as_str()).collect(),
            recent: &recent[..recent.len().min(RECENT_LIMIT)],
        }
    }

    fn allows(&self, rule: Rule, t: &hints::Template) -> bool {
        match rule {
            Rule::NoTypeStreak => self.streak_type != Some(t.kind.as_str()),
            Rule::NewContinent => {
                hints::continent_at(&t.country, t.lat, t.lng).is_none_or(|c| !self.continents.contains(&c))
            }
            Rule::NewCountry => !self.countries.contains(&t.country.as_str()),
            Rule::NotNearby => self
                .recent
                .iter()
                .all(|p| distance_km(p.lat, p.lng, t.lat, t.lng) > NEARBY_KM),
        }
    }
}

/// Picks one template from `unused`.
///
/// `all` is the full template list (used to look up the type of recent days)
/// and `recent` the past challenges, newest first. A tier is drawn by
/// `TIER_WEIGHTS`. Each candidate's penalty is the sum of `2^i` over the
/// rules it breaks, so one more important rule outweighs all the lesser ones.
/// The pick is random among the lowest-penalty candidates, preferring the
/// drawn tier on ties, so this only returns `None` when `unused` is empty.
pub fn pick<'a>(
    unused: &'a [hints::Template],
    all: &[hints::Template],
    recent: &[Past],
    rng: &mut Rng,
) -> Option<&'a hints::Template> {
    let kinds: HashMap<(&str, &str), &str> = all
        .iter()
        .map(|t| ((t.name.as_str(), t.country.as_str()), t.kind.as_str()))
        .collect();
    let ctx = Context::new(recent, &kinds);
    let tiers = tier_order(unused, rng);
    let penalty = |t: &hints::Template| -> u32 {
        RULES
            .iter()
            .enumerate()
            .filter(|(_, r)| !ctx.allows(**r, t))
            .map(|(i, _)| 1 << i)
            .sum()
    };

    // Keep only the candidates with the best (penalty, tier preference).
    let mut best: Option<((u32, usize), Vec<&hints::Template>)> = None;
    for t in unused {
        let Some(rank) = tiers.iter().position(|&tier| tier == t.tier) else {
            continue;
        };
        let key = (penalty(t), rank);
        match &mut best {
            Some((k, list)) if *k == key => list.push(t),
            Some((k, _)) if *k < key => {}
            _ => best = Some((key, vec![t])),
        }
    }
    let ((penalty, _), list) = best?;
    if penalty > 0 {
        let broken: Vec<Rule> = RULES
            .iter()
            .enumerate()
            .filter(|(i, _)| penalty & (1 << i) != 0)
            .map(|(_, r)| *r)
            .collect();
        tracing::info!("location pick had to break {broken:?}");
    }
    Some(list[rng.below(list.len())])
}

/// The tiers that still have entries: one drawn by weight first, then the
/// rest by descending weight.
fn tier_order(unused: &[hints::Template], rng: &mut Rng) -> Vec<u8> {
    let mut live: Vec<(u8, u32)> = TIER_WEIGHTS
        .into_iter()
        .filter(|(tier, _)| unused.iter().any(|t| t.tier == *tier))
        .collect();
    // Templates with a tier outside TIER_WEIGHTS still get picked, last.
    let mut extra: Vec<u8> = unused
        .iter()
        .map(|t| t.tier)
        .filter(|tier| !TIER_WEIGHTS.iter().any(|(w, _)| w == tier))
        .collect();
    extra.sort_unstable();
    extra.dedup();

    let total: u32 = live.iter().map(|(_, w)| w).sum();
    let mut order = Vec::with_capacity(live.len() + extra.len());
    if total > 0 {
        let mut roll = rng.below(total as usize) as u32;
        let first = live
            .iter()
            .position(|(_, w)| {
                let hit = roll < *w;
                roll = roll.saturating_sub(*w);
                hit
            })
            .unwrap_or(0);
        order.push(live.remove(first).0);
        order.extend(live.iter().map(|(t, _)| *t));
    }
    order.extend(extra);
    order
}

/// Unused templates per tier, for the daily log line.
pub fn tier_counts(unused: &[hints::Template]) -> String {
    TIER_WEIGHTS
        .iter()
        .map(|(tier, _)| format!("tier {tier}: {}", unused.iter().filter(|t| t.tier == *tier).count()))
        .collect::<Vec<_>>()
        .join(", ")
}

/// `locodle-server simulate [days]`: prints the next `days` picks and when
/// each tier runs out. With `DATABASE_URL` set it starts from the real used
/// set and recent days (read-only); otherwise from an empty history.
pub async fn simulate(days: usize, db: Option<&sqlx::PgPool>) -> Result<(), sqlx::Error> {
    let all = hints::templates();
    let (used, mut recent) = match db {
        Some(db) => (crate::locations::used_keys(db).await?, crate::locations::recent(db, None).await?),
        None => Default::default(),
    };
    let mut unused: Vec<hints::Template> = all
        .iter()
        .filter(|t| !used.contains(&(t.name.clone(), t.country.clone())))
        .cloned()
        .collect();

    println!("{} templates, {} unused ({})", all.len(), unused.len(), tier_counts(&unused));
    let mut rng = Rng::from_entropy();
    let mut tally: HashMap<String, usize> = HashMap::new();
    let mut emptied: Vec<String> = Vec::new();
    for day in 1..=days {
        let Some(t) = pick(&unused, &all, &recent, &mut rng).cloned() else {
            println!("day {day}: pool exhausted");
            break;
        };
        println!(
            "day {day:>3}  tier {}  {:<8}  {:<14}  {}, {}",
            t.tier,
            t.kind,
            hints::continent_at(&t.country, t.lat, t.lng).unwrap_or("?"),
            t.name,
            t.country
        );
        *tally.entry(format!("tier {}", t.tier)).or_default() += 1;
        *tally.entry(t.kind.clone()).or_default() += 1;
        *tally.entry(hints::continent_at(&t.country, t.lat, t.lng).unwrap_or("?").to_owned()).or_default() += 1;
        unused.retain(|u| !(u.name == t.name && u.country == t.country));
        if !unused.iter().any(|u| u.tier == t.tier) {
            emptied.push(format!("tier {} empty after day {day}", t.tier));
        }
        recent.insert(0, Past { name: t.name, country: t.country, lat: t.lat, lng: t.lng });
        recent.truncate(RECENT_LIMIT);
    }

    let mut tally: Vec<_> = tally.into_iter().collect();
    tally.sort();
    println!();
    for (k, v) in tally {
        println!("{k:<16} {v}");
    }
    for line in emptied {
        println!("{line}");
    }
    println!("left: {} ({})", unused.len(), tier_counts(&unused));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use hints::Template;

    fn t(kind: &str, name: &str, country: &str, lat: f64, lng: f64, tier: u8) -> Template {
        Template {
            kind: kind.into(),
            name: name.into(),
            lat,
            lng,
            country: country.into(),
            tier,
            wiki: None,
        }
    }

    fn past(t: &Template) -> Past {
        Past { name: t.name.clone(), country: t.country.clone(), lat: t.lat, lng: t.lng }
    }

    #[test]
    fn empty_pool_gives_none() {
        assert!(pick(&[], &[], &[], &mut Rng::seeded(1)).is_none());
    }

    #[test]
    fn relaxes_rules_rather_than_failing() {
        let a = t("city", "A", "France", 48.0, 2.0, 1);
        let b = t("city", "B", "France", 48.1, 2.1, 1);
        let c = t("city", "C", "France", 48.2, 2.2, 3);
        // C breaks every rule against A and B, but it's all that's left.
        let all = [a.clone(), b.clone(), c.clone()];
        let picked = pick(std::slice::from_ref(&c), &all, &[past(&b), past(&a)], &mut Rng::seeded(7));
        assert_eq!(picked.map(|t| t.name.as_str()), Some("C"));
    }

    #[test]
    fn prefers_another_tier_over_breaking_rules() {
        let recent = t("city", "Paris", "France", 48.85, 2.35, 1);
        let lyon = t("city", "Lyon", "France", 45.76, 4.83, 1);
        let lima = t("city", "Lima", "Peru", -12.05, -77.04, 3);
        let all = [recent.clone(), lyon.clone(), lima.clone()];
        let unused = [lyon, lima];
        for seed in 0..50 {
            let p = pick(&unused, &all, &[past(&recent)], &mut Rng::seeded(seed)).unwrap();
            assert_eq!(p.name, "Lima");
        }
    }

    #[test]
    fn breaks_type_streaks() {
        let x = t("natural", "X", "Chile", -30.0, -70.0, 1);
        let y = t("natural", "Y", "Japan", 35.0, 139.0, 1);
        let nat = t("natural", "N", "Kenya", 0.0, 37.0, 1);
        let city = t("city", "C", "Canada", 45.0, -75.0, 1);
        let all = [x.clone(), y.clone(), nat.clone(), city.clone()];
        let unused = [nat, city];
        for seed in 0..50 {
            let p = pick(&unused, &all, &[past(&y), past(&x)], &mut Rng::seeded(seed)).unwrap();
            assert_eq!(p.name, "C");
        }
    }

    /// A synthetic pool spread over many countries and continents.
    fn big_pool() -> Vec<Template> {
        let countries = [
            "France", "Japan", "Brazil", "Kenya", "Canada", "Australia", "India", "Peru",
            "Italy", "Egypt", "Mexico", "China", "Norway", "Chile", "Morocco", "Fiji",
            "Spain", "Vietnam", "Argentina", "Ghana", "Cuba", "New Zealand", "Nepal",
            "Colombia", "Greece", "Tanzania", "Panama", "Samoa", "Poland", "Jordan",
            "Ecuador", "Namibia", "Jamaica", "Tonga", "Iceland", "Oman", "Bolivia",
            "Senegal", "Honduras", "Palau",
        ];
        let kinds = ["city", "landmark", "natural"];
        (0..1500)
            .map(|i| {
                let tier = match i % 20 {
                    0..=6 => 1,
                    7..=14 => 2,
                    _ => 3,
                };
                t(
                    kinds[i % 3],
                    &format!("P{i}"),
                    countries[(i / 3) % countries.len()],
                    -60.0 + (i as f64 * 7.3) % 120.0,
                    -170.0 + (i as f64 * 13.7) % 340.0,
                    tier,
                )
            })
            .collect()
    }

    fn run(days: usize, seed: u64) -> Vec<Template> {
        let all = big_pool();
        let mut unused = all.clone();
        let mut recent: Vec<Past> = Vec::new();
        let mut rng = Rng::seeded(seed);
        let mut picks = Vec::new();
        for _ in 0..days {
            let p = pick(&unused, &all, &recent, &mut rng).unwrap().clone();
            unused.retain(|u| u.name != p.name);
            recent.insert(0, past(&p));
            picks.push(p);
        }
        picks
    }

    #[test]
    fn simulated_year_follows_the_rules() {
        let picks = run(365, 42);
        let mut names: Vec<_> = picks.iter().map(|p| &p.name).collect();
        names.sort();
        names.dedup();
        assert_eq!(names.len(), picks.len(), "no repeats");

        for (i, p) in picks.iter().enumerate() {
            let prev = |n: usize| &picks[i.saturating_sub(n)..i];
            assert!(
                prev(2).iter().all(|q| hints::continent(&q.country) != hints::continent(&p.country)),
                "continent repeated on day {i}"
            );
            assert!(prev(30).iter().all(|q| q.country != p.country), "country repeated on day {i}");
            if i >= 2 {
                assert!(
                    !(picks[i - 1].kind == p.kind && picks[i - 2].kind == p.kind),
                    "type streak on day {i}"
                );
            }
        }
    }

    #[test]
    fn tier_mix_matches_weights() {
        let picks = run(400, 9);
        let share = |tier| picks.iter().filter(|p| p.tier == tier).count() as f64 / picks.len() as f64;
        assert!((share(1) - 0.50).abs() < 0.07, "tier 1 share {}", share(1));
        assert!((share(2) - 0.35).abs() < 0.07, "tier 2 share {}", share(2));
        assert!((share(3) - 0.15).abs() < 0.06, "tier 3 share {}", share(3));
    }
}
