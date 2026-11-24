//! Reverse geocoding with a small cache that also shares in-flight lookups,
//! so the guess route and the client's follow-up /api/geocode call make a
//! single upstream request.

use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::Duration,
};

use futures::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use serde_json::{Map, Value};

use crate::util::truthy;

pub type GeoResult = Option<Arc<Value>>;
pub type GeoFuture = Shared<BoxFuture<'static, GeoResult>>;

const CACHE_MAX: usize = 500;
const USER_AGENT: &str = "Locodle/1.0";

#[derive(Default)]
pub struct Geocoder {
    cache: Mutex<Cache>,
}

#[derive(Default)]
struct Cache {
    map: HashMap<String, (u64, GeoFuture)>,
    order: VecDeque<(String, u64)>,
    next_gen: u64,
}

fn cache_key(lat: f64, lng: f64) -> String {
    format!("{lat:.4},{lng:.4}")
}

impl Geocoder {
    /// Starts (or joins) a lookup. The request runs in the background whether
    /// or not the returned future is awaited.
    pub fn lookup(self: &Arc<Self>, http: &reqwest::Client, lat: f64, lng: f64) -> GeoFuture {
        let key = cache_key(lat, lng);
        let mut cache = self.cache.lock().unwrap();
        if let Some((_, fut)) = cache.map.get(&key) {
            return fut.clone();
        }

        let generation = cache.next_gen;
        cache.next_gen += 1;

        let this = Arc::clone(self);
        let http = http.clone();
        let task_key = key.clone();
        let task = tokio::spawn(async move {
            let result = fetch(&http, lat, lng).await.map(Arc::new);
            if result.is_none() {
                // Don't keep failures around; a later call may succeed
                let mut cache = this.cache.lock().unwrap();
                if cache.map.get(&task_key).is_some_and(|(g, _)| *g == generation) {
                    cache.map.remove(&task_key);
                }
            }
            result
        });
        let fut: GeoFuture = async move { task.await.ok().flatten() }.boxed().shared();

        cache.map.insert(key.clone(), (generation, fut.clone()));
        cache.order.push_back((key, generation));
        while cache.map.len() > CACHE_MAX {
            let Some((old_key, old_gen)) = cache.order.pop_front() else { break };
            if cache.map.get(&old_key).is_some_and(|(g, _)| *g == old_gen) {
                cache.map.remove(&old_key);
            }
        }
        // Drop queue entries for keys that were removed after failing
        if cache.order.len() > CACHE_MAX * 2 {
            let Cache { map, order, .. } = &mut *cache;
            order.retain(|(k, g)| map.get(k).is_some_and(|(mg, _)| mg == g));
        }
        fut
    }
}

async fn fetch_json(http: &reqwest::Client, url: &str, timeout_ms: u64) -> Option<Value> {
    let res = http
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .timeout(Duration::from_millis(timeout_ms))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    res.json().await.ok()
}

/// Copies `src[key]` into `dst[as_key]` when present (JS drops `undefined`).
fn copy(dst: &mut Map<String, Value>, as_key: &str, value: Option<&Value>) {
    if let Some(v) = value {
        dst.insert(as_key.into(), v.clone());
    }
}

async fn fetch(http: &reqwest::Client, lat: f64, lng: f64) -> Option<Value> {
    let nominatim = format!(
        "https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&addressdetails=1"
    );
    if let Some(data) = fetch_json(http, &nominatim, 1500).await {
        let mut out = Map::new();
        copy(&mut out, "name", data.get("display_name"));
        copy(&mut out, "address", data.get("address"));
        return Some(Value::Object(out));
    }
    tracing::info!("Nominatim failed/timed out, trying backup...");

    let backup = format!(
        "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lng}&localityLanguage=en"
    );
    let Some(data) = fetch_json(http, &backup, 5000).await else {
        tracing::error!("All geocoding providers failed");
        return None;
    };

    let name = ["locality", "city", "principalSubdivision", "countryName"]
        .iter()
        .filter(|k| truthy(data.get(**k)))
        .filter_map(|k| match data.get(*k) {
            Some(Value::String(s)) => Some(s.clone()),
            Some(other) => Some(other.to_string()),
            None => None,
        })
        .collect::<Vec<_>>()
        .join(", ");

    let mut address = Map::new();
    let city = if truthy(data.get("city")) { data.get("city") } else { data.get("locality") };
    copy(&mut address, "city", city);
    copy(&mut address, "state", data.get("principalSubdivision"));
    copy(&mut address, "country", data.get("countryName"));
    if let Some(Value::String(code)) = data.get("countryCode") {
        address.insert("country_code".into(), Value::String(code.to_lowercase()));
    }

    let mut out = Map::new();
    out.insert("name".into(), Value::String(name));
    out.insert("address".into(), Value::Object(address));
    Some(Value::Object(out))
}
