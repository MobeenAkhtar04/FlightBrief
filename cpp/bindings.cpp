#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "navengine.hpp"

namespace py = pybind11;

PYBIND11_MODULE(navengine_ext, m) {
    m.doc() = "navengine - flight nav calculations from C++";

    // expose the GoNoGoResult struct
    py::class_<navengine::GoNoGoResult>(m, "GoNoGoResult")
        .def_readwrite("decision", &navengine::GoNoGoResult::decision)
        .def_readwrite("reasons", &navengine::GoNoGoResult::reasons)
        .def("__repr__", [](const navengine::GoNoGoResult &r) {
            return "<GoNoGoResult decision='" + r.decision + "'>";
        });

    // expose FlightTime struct
    py::class_<navengine::FlightTime>(m, "FlightTime")
        .def_readwrite("hours", &navengine::FlightTime::hours)
        .def_readwrite("minutes", &navengine::FlightTime::minutes)
        .def_readwrite("total_hours", &navengine::FlightTime::total_hours)
        .def("__repr__", [](const navengine::FlightTime &ft) {
            return "<FlightTime " + std::to_string(ft.hours) + "h " +
                   std::to_string(ft.minutes) + "m>";
        });

    m.def("vincenty_distance", &navengine::vincenty_distance,
          py::arg("lat1"), py::arg("lon1"), py::arg("lat2"), py::arg("lon2"),
          "Vincenty inverse formula - distance between two points in nautical miles");

    m.def("initial_bearing", &navengine::initial_bearing,
          py::arg("lat1"), py::arg("lon1"), py::arg("lat2"), py::arg("lon2"),
          "Initial bearing from point 1 to point 2 in degrees true");

    m.def("crosswind_component", &navengine::crosswind_component,
          py::arg("wind_dir"), py::arg("wind_speed"), py::arg("runway_heading"),
          "Crosswind component in knots");

    m.def("headwind_component", &navengine::headwind_component,
          py::arg("wind_dir"), py::arg("wind_speed"), py::arg("runway_heading"),
          "Headwind component in knots (negative = tailwind)");

    m.def("fuel_burn", &navengine::fuel_burn,
          py::arg("distance_nm"), py::arg("cruise_speed_kts"), py::arg("fuel_flow_gph"),
          "Fuel burn estimate in gallons (includes 10% reserve)");

    m.def("flight_time", &navengine::flight_time,
          py::arg("distance_nm"), py::arg("cruise_speed_kts"),
          "Flight time as FlightTime struct");

    m.def("go_no_go", &navengine::go_no_go,
          py::arg("ceiling_ft"), py::arg("visibility_sm"),
          py::arg("wind_speed_kts"), py::arg("crosswind_kts"),
          "Go/No-Go decision based on VFR weather minimums");
}
