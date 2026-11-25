use serde::Deserialize;

#[derive(Deserialize, Clone)]
pub struct Template {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub lat: f64,
    pub lng: f64,
    pub country: String,
    /// Fame tier: 1 iconic, 2 well-known, 3 deep cut. Set by
    /// `scripts/locations.mjs score`; unscored entries count as 2.
    #[serde(default = "default_tier")]
    pub tier: u8,
    /// English Wikipedia article title, for the post-game photo and summary.
    #[serde(default)]
    pub wiki: Option<String>,
}

fn default_tier() -> u8 {
    2
}

/// The location pool. Parsed on demand (once a day) rather than kept in memory.
pub fn templates() -> Vec<Template> {
    serde_json::from_str(include_str!("../data/location_templates.json"))
        .expect("data/location_templates.json is valid")
}

pub fn generate_hints(t: &Template) -> Vec<String> {
    let mut hints = Vec::with_capacity(3);
    let continent = continent_at(&t.country, t.lat, t.lng);
    match t.kind.as_str() {
        // Naming the country gave too much away; the continent is enough.
        "city" => hints.push(match continent {
            Some(c) => format!("This is a major city in {c}"),
            None => "This is a major city".into(),
        }),
        "natural" => hints.push("This is a natural wonder or landmark".into()),
        "landmark" => hints.push("This is a famous historical or cultural landmark".into()),
        _ => {}
    }
    hints.push(
        if t.lat > 0.0 {
            "Located in the Northern Hemisphere"
        } else {
            "Located in the Southern Hemisphere"
        }
        .into(),
    );
    // The city hint already names the continent.
    if let Some(continent) = continent.filter(|_| t.kind != "city") {
        hints.push(format!("Located in {continent}"));
    }
    hints
}

/// Continent for a place, by country, except where a country spans
/// continents: Hawaii is Oceania, not North America.
pub fn continent_at(country: &str, lat: f64, lng: f64) -> Option<&'static str> {
    if country == "United States" && lng < -150.0 && lat < 30.0 {
        return Some("Oceania");
    }
    continent(country)
}

/// Continent by country name. Overseas territories are listed under their own
/// names (Réunion, Martinique, ...) so they get the right continent.
pub fn continent(country: &str) -> Option<&'static str> {
    Some(match country {
        "Japan" | "China" | "Tibet/China" | "India" | "Thailand" | "Vietnam" | "Cambodia"
        | "Myanmar" | "Laos" | "Indonesia" | "Philippines" | "Malaysia" | "Singapore"
        | "Hong Kong" | "Macau" | "Taiwan" | "South Korea" | "North Korea" | "Mongolia"
        | "Nepal" | "Sri Lanka" | "United Arab Emirates" | "Jordan" | "Iran" | "Iraq"
        | "Syria" | "Palestine" | "Uzbekistan" | "Kazakhstan" | "Kyrgyzstan" | "Tajikistan"
        | "Turkmenistan" | "Afghanistan" | "Yemen" | "Israel/Jordan" | "Maldives"
        | "Bangladesh" | "Pakistan" | "Saudi Arabia" | "Qatar" | "Bahrain" | "Kuwait"
        | "Oman" | "Lebanon" | "Israel" | "Azerbaijan" | "Georgia" | "Armenia" | "Bhutan"
        | "Brunei" | "Timor-Leste" => "Asia",

        "United Kingdom" | "France" | "Italy" | "Spain" | "Portugal" | "Germany"
        | "Netherlands" | "Belgium" | "Luxembourg" | "Austria" | "Switzerland" | "Greece"
        | "Croatia" | "Slovenia" | "Montenegro" | "Romania" | "Moldova" | "Ireland"
        | "Norway" | "Iceland" | "Denmark" | "Sweden" | "Finland" | "Poland"
        | "Czech Republic" | "Hungary" | "Bulgaria" | "Serbia" | "Kosovo" | "Slovakia"
        | "Estonia" | "Latvia" | "Lithuania" | "Belarus" | "Ukraine"
        | "Bosnia and Herzegovina" | "Albania" | "North Macedonia" | "Malta" | "Cyprus" => {
            "Europe"
        }
        "Russia" | "Turkey" => "Europe/Asia",

        "United States" | "Canada" | "Mexico" | "Guatemala" | "Belize" | "El Salvador"
        | "Cuba" | "Puerto Rico" | "Dominican Republic" | "Haiti" | "Jamaica" | "Bahamas"
        | "Honduras" | "Nicaragua" | "Costa Rica" | "Panama" | "Antigua and Barbuda"
        | "Montserrat" | "Martinique" => "North America",

        "Brazil" | "Argentina" | "Chile" | "Peru" | "Bolivia" | "Ecuador" | "Venezuela"
        | "Colombia" | "Uruguay" | "Paraguay" | "Guyana" | "Suriname" | "Argentina/Brazil" => {
            "South America"
        }

        "Egypt" | "Morocco" | "South Africa" | "Tanzania" | "Namibia" | "Botswana"
        | "Zimbabwe" | "Algeria" | "Seychelles" | "Tunisia" | "Libya" | "Ethiopia" | "Kenya"
        | "Uganda" | "Rwanda" | "Madagascar" | "Nigeria" | "Ghana" | "Senegal" | "Zambia"
        | "Mauritius" | "Réunion" | "Saint Helena" | "Ascension Island" | "Sudan"
        | "South Sudan" | "Eritrea" | "Somalia" | "Chad" | "Mali" | "Burkina Faso"
        | "Mauritania" | "Guinea" | "Sierra Leone" | "Liberia" | "Ivory Coast" | "Cameroon"
        | "Central African Republic" | "Democratic Republic of the Congo" | "Angola"
        | "Mozambique" => "Africa",

        "Australia" | "New Zealand" | "Fiji" | "French Polynesia" | "Palau" | "Vanuatu"
        | "Samoa" | "Tonga" | "Cook Islands" | "Micronesia" | "Guam" | "Papua New Guinea"
        | "New Caledonia" | "Marshall Islands" => "Oceania",

        "Antarctica" => "Antarctica",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn templates_parse() {
        let t = super::templates();
        assert!(t.len() > 400);
        assert!(t.iter().all(|t| ["city", "landmark", "natural"].contains(&t.kind.as_str())));
        assert!(t.iter().all(|t| (1..=3).contains(&t.tier)));
    }

    #[test]
    fn every_country_has_a_continent() {
        let missing: Vec<String> = super::templates()
            .iter()
            .filter(|t| super::continent(&t.country).is_none())
            .map(|t| format!("{} ({})", t.name, t.country))
            .collect();
        assert!(missing.is_empty(), "no continent for: {missing:?}");
    }

    #[test]
    fn hawaii_is_oceania() {
        assert_eq!(super::continent_at("United States", 21.31, -157.86), Some("Oceania"));
        assert_eq!(super::continent_at("United States", 61.22, -149.89), Some("North America"));
    }

    #[test]
    fn city_hint_names_the_continent_not_the_country() {
        let t = super::Template {
            kind: "city".into(),
            name: "Lima".into(),
            lat: -12.05,
            lng: -77.04,
            country: "Peru".into(),
            tier: 1,
            wiki: None,
        };
        assert_eq!(
            super::generate_hints(&t),
            ["This is a major city in South America", "Located in the Southern Hemisphere"]
        );
    }
}
