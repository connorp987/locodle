use serde::Deserialize;

#[derive(Deserialize)]
pub struct Template {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub lat: f64,
    pub lng: f64,
    pub country: String,
}

/// The location pool. Parsed on demand (once a day) rather than kept in memory.
pub fn templates() -> Vec<Template> {
    serde_json::from_str(include_str!("../data/location_templates.json"))
        .expect("data/location_templates.json is valid")
}

pub fn generate_hints(t: &Template) -> Vec<String> {
    let mut hints = Vec::with_capacity(3);
    match t.kind.as_str() {
        "city" => hints.push(format!("This is a major city in {}", t.country)),
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
    if let Some(continent) = continent(&t.country) {
        hints.push(format!("Located in {continent}"));
    }
    hints
}

pub fn continent(country: &str) -> Option<&'static str> {
    Some(match country {
        "Japan" | "China" | "Tibet/China" | "India" | "Thailand" | "Vietnam" | "Cambodia"
        | "Myanmar" | "Laos" | "Indonesia" | "Philippines" | "Malaysia" | "Singapore"
        | "Hong Kong" | "Taiwan" | "South Korea" | "Nepal" | "Sri Lanka"
        | "United Arab Emirates" | "Jordan" | "Iran" | "Uzbekistan" | "Yemen"
        | "Israel/Jordan" | "Maldives" | "Bangladesh" | "Pakistan" | "Saudi Arabia" | "Qatar"
        | "Kuwait" | "Oman" | "Lebanon" | "Israel" | "Azerbaijan" | "Georgia" | "Armenia"
        | "Bhutan" => "Asia",

        "United Kingdom" | "France" | "Italy" | "Spain" | "Portugal" | "Germany"
        | "Netherlands" | "Belgium" | "Austria" | "Switzerland" | "Greece" | "Croatia"
        | "Slovenia" | "Montenegro" | "Romania" | "Ireland" | "Norway" | "Iceland"
        | "Denmark" | "Sweden" | "Finland" | "Poland" | "Czech Republic" | "Hungary"
        | "Bulgaria" | "Serbia" | "Slovakia" | "Estonia" | "Latvia" | "Lithuania"
        | "Bosnia and Herzegovina" | "Albania" | "North Macedonia" => "Europe",
        "Russia" | "Turkey" => "Europe/Asia",

        "United States" | "Canada" | "Mexico" | "Guatemala" | "Cuba" | "Puerto Rico"
        | "Dominican Republic" | "Jamaica" | "Honduras" | "Nicaragua" | "Costa Rica"
        | "Panama" => "North America",

        "Brazil" | "Argentina" | "Chile" | "Peru" | "Bolivia" | "Ecuador" | "Venezuela"
        | "Colombia" | "Uruguay" | "Argentina/Brazil" => "South America",

        "Egypt" | "Morocco" | "South Africa" | "Tanzania" | "Namibia" | "Botswana"
        | "Zimbabwe" | "Algeria" | "Seychelles" | "Tunisia" | "Libya" | "Ethiopia" | "Kenya"
        | "Uganda" | "Rwanda" | "Madagascar" | "Nigeria" | "Ghana" | "Senegal" | "Zambia"
        | "Mauritius" => "Africa",

        "Australia" | "New Zealand" | "Fiji" | "French Polynesia" | "Palau" | "Vanuatu"
        | "Samoa" | "Tonga" | "Cook Islands" | "Micronesia" | "Guam" | "Papua New Guinea"
        | "New Caledonia" => "Oceania",

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
    }
}
