#include "navengine.hpp"
#include <cmath>
#include <stdexcept>
#include <sstream>

namespace navengine {

// WGS84 ellipsoid constants
static const double a = 6378137.0;          // semi-major axis meters
static const double f = 1.0 / 298.257223563; // flattening
static const double b = a * (1.0 - f);       // semi-minor axis

static const double PI = 3.14159265358979323846;
static const double NM_PER_METER = 1.0 / 1852.0;

static double to_rad(double deg) {
    return deg * PI / 180.0;
}

static double to_deg(double rad) {
    return rad * 180.0 / PI;
}

// Vincenty inverse solution
// I spent like 2 hours debugging this - turns out I had sin/cos swapped lol
double vincenty_distance(double lat1, double lon1, double lat2, double lon2) {
    if (lat1 == lat2 && lon1 == lon2) return 0.0;

    double phi1 = to_rad(lat1);
    double phi2 = to_rad(lat2);
    double L = to_rad(lon2 - lon1);

    double U1 = atan((1 - f) * tan(phi1));
    double U2 = atan((1 - f) * tan(phi2));

    double sinU1 = sin(U1), cosU1 = cos(U1);
    double sinU2 = sin(U2), cosU2 = cos(U2);

    double lambda = L;
    double lambda_prev;
    double sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM;

    int iter = 0;
    do {
        double sinLambda = sin(lambda);
        double cosLambda = cos(lambda);

        double t1 = cosU2 * sinLambda;
        double t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
        sinSigma = sqrt(t1 * t1 + t2 * t2);

        if (sinSigma == 0.0) return 0.0; // coincident points

        cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
        sigma = atan2(sinSigma, cosSigma);

        sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
        cos2Alpha = 1.0 - sinAlpha * sinAlpha;

        cos2SigmaM = (cos2Alpha != 0.0)
            ? cosSigma - 2.0 * sinU1 * sinU2 / cos2Alpha
            : 0.0; // equatorial line

        double C = f / 16.0 * cos2Alpha * (4.0 + f * (4.0 - 3.0 * cos2Alpha));
        lambda_prev = lambda;
        lambda = L + (1.0 - C) * f * sinAlpha *
                 (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma *
                 (-1.0 + 2.0 * cos2SigmaM * cos2SigmaM)));

        iter++;
    } while (fabs(lambda - lambda_prev) > 1e-12 && iter < 100);

    double uSq = cos2Alpha * (a * a - b * b) / (b * b);
    double A_coef = 1.0 + uSq / 16384.0 * (4096.0 + uSq * (-768.0 + uSq * (320.0 - 175.0 * uSq)));
    double B_coef = uSq / 1024.0 * (256.0 + uSq * (-128.0 + uSq * (74.0 - 47.0 * uSq)));

    double deltaSigma = B_coef * sinSigma * (cos2SigmaM + B_coef / 4.0 *
                        (cosSigma * (-1.0 + 2.0 * cos2SigmaM * cos2SigmaM) -
                         B_coef / 6.0 * cos2SigmaM * (-3.0 + 4.0 * sinSigma * sinSigma) *
                         (-3.0 + 4.0 * cos2SigmaM * cos2SigmaM)));

    double dist_m = b * A_coef * (sigma - deltaSigma);
    return dist_m * NM_PER_METER;
}

double initial_bearing(double lat1, double lon1, double lat2, double lon2) {
    double phi1 = to_rad(lat1);
    double phi2 = to_rad(lat2);
    double dLon = to_rad(lon2 - lon1);

    double y = sin(dLon) * cos(phi2);
    double x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLon);

    double bearing = to_deg(atan2(y, x));
    // normalize to 0-360
    return fmod(bearing + 360.0, 360.0);
}

double crosswind_component(double wind_dir, double wind_speed, double runway_heading) {
    double angle = to_rad(wind_dir - runway_heading);
    return wind_speed * sin(angle);
}

double headwind_component(double wind_dir, double wind_speed, double runway_heading) {
    double angle = to_rad(wind_dir - runway_heading);
    // positive = headwind, negative = tailwind
    return wind_speed * cos(angle);
}

double fuel_burn(double distance_nm, double cruise_speed_kts, double fuel_flow_gph) {
    if (cruise_speed_kts <= 0) return 0.0;
    double time_hrs = distance_nm / cruise_speed_kts;
    // add ~10% reserve - TODO: make this configurable
    return time_hrs * fuel_flow_gph * 1.10;
}

FlightTime flight_time(double distance_nm, double cruise_speed_kts) {
    if (cruise_speed_kts <= 0) {
        return {0, 0, 0.0};
    }
    double total = distance_nm / cruise_speed_kts;
    int hrs = static_cast<int>(total);
    int mins = static_cast<int>((total - hrs) * 60.0);
    return {hrs, mins, total};
}

GoNoGoResult go_no_go(double ceiling_ft, double visibility_sm,
                       double wind_speed_kts, double crosswind_kts) {
    GoNoGoResult result;
    result.decision = "GO";

    // VFR minimums check
    // these are day VFR, Class G below 1200 AGL - real minimums vary by airspace
    if (ceiling_ft < 1000.0) {
        result.decision = "NOGO";
        std::ostringstream oss;
        oss << "Ceiling " << static_cast<int>(ceiling_ft) << "ft is below 1000ft minimum";
        result.reasons.push_back(oss.str());
    } else if (ceiling_ft < 3000.0) {
        std::ostringstream oss;
        oss << "Ceiling " << static_cast<int>(ceiling_ft) << "ft is marginal VFR";
        result.reasons.push_back(oss.str());
    }

    if (visibility_sm < 1.0) {
        result.decision = "NOGO";
        std::ostringstream oss;
        oss << "Visibility " << visibility_sm << "SM is below 1SM minimum";
        result.reasons.push_back(oss.str());
    } else if (visibility_sm < 3.0) {
        result.decision = "NOGO";
        std::ostringstream oss;
        oss << "Visibility " << visibility_sm << "SM is below 3SM VFR minimum";
        result.reasons.push_back(oss.str());
    } else if (visibility_sm < 5.0) {
        std::ostringstream oss;
        oss << "Visibility " << visibility_sm << "SM is marginal";
        result.reasons.push_back(oss.str());
    }

    // 20kt crosswind limit - this is conservative, actual limit depends on aircraft POH
    if (crosswind_kts > 20.0) {
        result.decision = "NOGO";
        std::ostringstream oss;
        oss << "Crosswind " << static_cast<int>(crosswind_kts) << "kts exceeds 20kt limit";
        result.reasons.push_back(oss.str());
    } else if (crosswind_kts > 15.0) {
        std::ostringstream oss;
        oss << "Crosswind " << static_cast<int>(crosswind_kts) << "kts is high";
        result.reasons.push_back(oss.str());
    }

    if (wind_speed_kts > 30.0) {
        result.decision = "NOGO";
        std::ostringstream oss;
        oss << "Wind speed " << static_cast<int>(wind_speed_kts) << "kts is excessive";
        result.reasons.push_back(oss.str());
    } else if (wind_speed_kts > 20.0) {
        std::ostringstream oss;
        oss << "Wind speed " << static_cast<int>(wind_speed_kts) << "kts is strong";
        result.reasons.push_back(oss.str());
    }

    if (result.reasons.empty()) {
        result.reasons.push_back("All conditions within limits");
    }

    return result;
}

} // namespace navengine
