source("R/utils_config.R")

print("Downloading OSM Data")
source("scripts/01_download_osm.R")
source("scripts/01b_download_poi.R")
source("scripts/01c_download_footways.R")
source("scripts/01d_download_traffic_signals.R")
source("scripts/01e_download_bike_parking.R")

print("Downloading Stats Data")

source("scripts/02_download_estat.R")
source("scripts/03_download_ksj.R")
source("scripts/04_download_dem.R")

print("Segment tables")

source("scripts/05_build_segment_table.R")
source("scripts/05b_join_segment_context.R")
source("scripts/05c_analyse_network.R")


print("Hex grid")

source("scripts/06_build_hex_grid.R")
source("scripts/07_join_population.R")
source("scripts/08_join_poi.R")
source("scripts/09_join_terrain.R")
source("scripts/10_compute_scores.R")
source("scripts/10b_compute_hex_roi.R")

print("Score interventions")

source("scripts/05d_score_interventions.R")

print("Summary/Export")

source("scripts/10c_compute_summary_stats.R")
source("scripts/11_export.R")
source("scripts/12_compute_investment_ranking.R")


print("Plot")
source("scripts/11_plot_leaflet_v2.R")
print(m)


print("Merge")
