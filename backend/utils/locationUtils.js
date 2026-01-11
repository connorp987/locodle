export function generateHints(location) {
  const hints = [];

  if (location.type === "city") {
    hints.push(`This is a major city in ${location.country}`);
  } else if (location.type === "natural") {
    hints.push(`This is a natural wonder or landmark`);
  } else if (location.type === "landmark") {
    hints.push(`This is a famous historical or cultural landmark`);
  }

  if (location.lat > 0) {
    hints.push("Located in the Northern Hemisphere");
  } else {
    hints.push("Located in the Southern Hemisphere");
  }

  const continent = getContinent(location.country);
  if (continent) {
    hints.push(`Located in ${continent}`);
  }

  return hints;
}

export function getContinent(country) {
  const continents = {
    Japan: "Asia",
    China: "Asia",
    "Tibet/China": "Asia",
    India: "Asia",
    Thailand: "Asia",
    Vietnam: "Asia",
    Cambodia: "Asia",
    Myanmar: "Asia",
    Laos: "Asia",
    Indonesia: "Asia",
    Philippines: "Asia",
    Malaysia: "Asia",
    Singapore: "Asia",
    "Hong Kong": "Asia",
    Taiwan: "Asia",
    "South Korea": "Asia",
    Nepal: "Asia",
    "Sri Lanka": "Asia",
    "United Arab Emirates": "Asia",
    Jordan: "Asia",
    Iran: "Asia",
    Uzbekistan: "Asia",
    Yemen: "Asia",
    "Israel/Jordan": "Asia",
    Maldives: "Asia",
    Bangladesh: "Asia",
    Pakistan: "Asia",
    "Saudi Arabia": "Asia",
    Qatar: "Asia",
    Kuwait: "Asia",
    Oman: "Asia",
    Lebanon: "Asia",
    Israel: "Asia",
    Azerbaijan: "Asia",
    Georgia: "Asia",
    Armenia: "Asia",
    Bhutan: "Asia",

    "United Kingdom": "Europe",
    France: "Europe",
    Italy: "Europe",
    Spain: "Europe",
    Portugal: "Europe",
    Germany: "Europe",
    Netherlands: "Europe",
    Belgium: "Europe",
    Austria: "Europe",
    Switzerland: "Europe",
    Greece: "Europe",
    Croatia: "Europe",
    Slovenia: "Europe",
    Montenegro: "Europe",
    Romania: "Europe",
    Ireland: "Europe",
    Norway: "Europe",
    Iceland: "Europe",
    Denmark: "Europe",
    Sweden: "Europe",
    Finland: "Europe",
    Poland: "Europe",
    "Czech Republic": "Europe",
    Hungary: "Europe",
    Bulgaria: "Europe",
    Serbia: "Europe",
    Slovakia: "Europe",
    Estonia: "Europe",
    Latvia: "Europe",
    Lithuania: "Europe",
    "Bosnia and Herzegovina": "Europe",
    Albania: "Europe",
    "North Macedonia": "Europe",
    Russia: "Europe/Asia",
    Turkey: "Europe/Asia",

    "United States": "North America",
    Canada: "North America",
    Mexico: "North America",
    Guatemala: "North America",
    Cuba: "North America",
    "Puerto Rico": "North America",
    "Dominican Republic": "North America",
    Jamaica: "North America",
    Honduras: "North America",
    Nicaragua: "North America",
    "Costa Rica": "North America",
    Panama: "North America",

    Brazil: "South America",
    Argentina: "South America",
    Chile: "South America",
    Peru: "South America",
    Bolivia: "South America",
    Ecuador: "South America",
    Venezuela: "South America",
    Colombia: "South America",
    Uruguay: "South America",
    "Argentina/Brazil": "South America",

    Egypt: "Africa",
    Morocco: "Africa",
    "South Africa": "Africa",
    Tanzania: "Africa",
    Namibia: "Africa",
    Botswana: "Africa",
    Zimbabwe: "Africa",
    Algeria: "Africa",
    Seychelles: "Africa",
    Tunisia: "Africa",
    Libya: "Africa",
    Ethiopia: "Africa",
    Kenya: "Africa",
    Uganda: "Africa",
    Rwanda: "Africa",
    Madagascar: "Africa",
    Nigeria: "Africa",
    Ghana: "Africa",
    Senegal: "Africa",
    Zambia: "Africa",
    Mauritius: "Africa",

    Australia: "Oceania",
    "New Zealand": "Oceania",
    Fiji: "Oceania",
    "French Polynesia": "Oceania",
    Palau: "Oceania",
    Vanuatu: "Oceania",
    Samoa: "Oceania",
    Tonga: "Oceania",
    "Cook Islands": "Oceania",
    Micronesia: "Oceania",
    Guam: "Oceania",
    "Papua New Guinea": "Oceania",
    "New Caledonia": "Oceania",

    Antarctica: "Antarctica",
  };

  return continents[country] || null;
}

export function getEasternDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
