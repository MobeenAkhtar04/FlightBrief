#pragma once

#include <string>
#include <vector>
#include <tuple>

// NavEngine - core flight calculations
// most of the geo math is from Aviation Formulary by Ed Williams
// https://edwilliams.org/avform147.htm

namespace navengine {

// holds the go/no-go decision result
struct GoNoGoResult {
    std::string decision;  // "GO" or "NOGO"
    std::vector<std::string> reasons;
};

// holds flight time broken into hours + minutes
struct FlightTime {
    int hours;
    int minutes;
    double total_hours;
};

// vincenty inverse formula - more accurate than haversine for long distances
// returns distance in nautical miles
double vincenty_distance(double lat1, double lon1, double lat2, double lon2);

// returns initial bearing from point 1 to point 2, in degrees true (0-360)
double initial_bearing(double lat1, double lon1, double lat2, double lon2);

// crosswind component formula: wind_speed * sin(wind_angle)
// wind_dir and runway_heading in degrees magnetic
double crosswind_component(double wind_dir, double wind_speed, double runway_heading);

// headwind is positive (headwind), negative means tailwind
double headwind_component(double wind_dir, double wind_speed, double runway_heading);

// simple fuel burn calc: fuel = (distance / speed) * fuel_flow
double fuel_burn(double distance_nm, double cruise_speed_kts, double fuel_flow_gph);

// flight time based on distance and speed
FlightTime flight_time(double distance_nm, double cruise_speed_kts);

// basic go/no-go decision logic
// checks VFR minimums - not for actual flight planning use lol
GoNoGoResult go_no_go(double ceiling_ft, double visibility_sm,
                       double wind_speed_kts, double crosswind_kts);

} // namespace navengine
