use std::f64::consts::PI;

/// Great-circle distance in km (haversine).
pub fn distance_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const R: f64 = 6371.0;
    let d_lat = (lat2 - lat1).to_radians();
    let d_lon = (lon2 - lon1).to_radians();
    let a = (d_lat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (d_lon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());
    R * c
}

/// Rhumb-line bearing in degrees, 0..360.
pub fn bearing(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let start_lat = lat1.to_radians();
    let dest_lat = lat2.to_radians();
    let mut d_lon = lon2.to_radians() - lon1.to_radians();

    let d_phi = ((dest_lat / 2.0 + PI / 4.0).tan() / (start_lat / 2.0 + PI / 4.0).tan()).ln();

    if d_lon.abs() > PI {
        d_lon = if d_lon > 0.0 { -(2.0 * PI - d_lon) } else { 2.0 * PI + d_lon };
    }

    (d_lon.atan2(d_phi).to_degrees() + 360.0) % 360.0
}

pub fn cardinal_direction(angle: f64) -> &'static str {
    const DIRECTIONS: [&str; 8] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    let mut a = angle % 360.0;
    if a < 0.0 {
        a += 360.0;
    }
    DIRECTIONS[(crate::util::js_round(a / 45.0) as usize) % 8]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paris_to_london() {
        let d = distance_km(48.8566, 2.3522, 51.5074, -0.1278);
        assert!((d - 343.5).abs() < 1.0, "{d}");
        assert_eq!(cardinal_direction(bearing(48.8566, 2.3522, 51.5074, -0.1278)), "NW");
    }

    #[test]
    fn crosses_antimeridian() {
        let b = bearing(0.0, 179.0, 0.0, -179.0);
        assert!((b - 90.0).abs() < 1e-9, "{b}");
    }
}
