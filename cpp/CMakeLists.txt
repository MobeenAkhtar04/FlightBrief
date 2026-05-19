cmake_minimum_required(VERSION 3.14)
project(navengine)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# need pybind11 - install with: pip install pybind11
find_package(pybind11 REQUIRED)

pybind11_add_module(navengine_ext
    navengine.cpp
    bindings.cpp
)

target_include_directories(navengine_ext PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# optimization flags
if(NOT MSVC)
    target_compile_options(navengine_ext PRIVATE -O2 -Wall)
endif()

# put the .so in the api directory so python can import it
set_target_properties(navengine_ext PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/../api"
)
