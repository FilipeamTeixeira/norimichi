/**
 * Every string the UI can put in front of a reader, in English.
 *
 * This file is the source of truth: `ja.ts` is typed as `Dict`, so a key added
 * here and not there fails `tsc` rather than silently rendering English inside
 * a Japanese page. That is the entire reason these are typed TS objects and not
 * JSON — a JSON dictionary cannot make the compiler care.
 *
 * What does *not* belong here: anything the pipeline exports as data. Street
 * names, route designations (横浜市道82号山下本牧磯子線), station names, OSM
 * `amenity` values and hex ids are already in whatever language OSM has them
 * in, and are rendered through untouched. The pipeline's small closed
 * vocabularies — `display_category`, `recommendation`, `cost_tier`,
 * `cycleway_type` — are the exception and *are* here: they are UI labels that
 * happen to be computed in R, and leaving them in English would put two
 * languages inside one sentence.
 *
 * Interpolation is a function, not a `{placeholder}` template, so the compiler
 * checks the arguments at every call site in both languages.
 */

const en = {
  nav: {
    network: "Network",
    access: "Access",
    route: "Route Analysis",
    ranking: "Investment Ranking",
    about: "About",
    language: "Language",
    region: "Study area",
  },

  common: {
    close: "Close",
    clear: "Clear",
    loading: "Loading…",
    noData: "No data",
    yes: "Yes",
    no: "No",
  },

  /** DisplayCategory — pipeline/R/score_suitability.R. */
  categories: {
    high: "High suitability",
    moderate: "Moderate",
    bottleneck: "Strategic bottleneck",
    low_priority: "Low priority",
  },

  /** CyclewayType — classify_cycleway_type() in pipeline/R/score_lts.R. */
  cyclewayTypes: {
    dedicated: "Dedicated cycleway",
    shared_path: "Shared with pedestrians",
    on_road: "On-road lane",
  },

  /** InterventionType — INTERVENTION_TYPES in pipeline/R/score_intervention.R. */
  interventions: {
    "Protected cycle lane": "Protected cycle lane",
    "Missing link": "Missing link",
    "Traffic calming": "Traffic calming",
    "Crossing improvement": "Crossing improvement",
    "Bike parking": "Bike parking",
  },

  costTiers: {
    Low: "Low",
    Medium: "Medium",
    High: "High",
  },

  /**
   * A corridor's display label, for the 52% of them OSM gives no name.
   *
   * `kind` is the raw OSM highway class (tertiary, residential) and stays in
   * English in both languages: it is a tag value a planner matches against the
   * data, not a word being used for its meaning.
   */
  corridor: {
    unnamed: (kind: string) => `Unnamed ${kind}`,
    unnamedNear: (kind: string, station: string) =>
      `Unnamed ${kind} near ${station}`,
    fallbackKind: "road",
  },

  units: {
    people: "people",
    perDay: "/day",
    kgPerDay: "kg/day",
    spaces: "spaces",
    kmh: "km/h",
    degrees: "°",
    perHundred: "/ 100",
    metres: (v: number) => `${v} m`,
    km: (v: string) => `${v} km`,
    minutes: (v: number) => `${v} min`,
    /**
     * Construction-scale yen, rounded hard on purpose: the unit costs behind
     * these are illustrative placeholders, and printing ¥18,432,915 would
     * dress a guess as a quotation.
     */
    yenBig: (v: number) =>
      v >= 1e9
        ? `¥${(v / 1e9).toFixed(1)}bn`
        : v >= 1e6
          ? `¥${(v / 1e6).toFixed(0)}M`
          : `¥${Math.round(v / 1e3)}k`,
    years: (v: string) => `${v} yr`,
  },

  metrics: {
    viewGroups: {
      areas: {
        title: "Areas",
        caption:
          "Per neighbourhood hexagon — quantities that only exist over an area.",
      },
      streets: {
        title: "Streets",
        caption:
          "Per road segment. Zoom changes how legible these are, never which is shown.",
      },
      network: {
        title: "Connectivity",
        caption:
          "Identities rather than measurements — which calm routes are cut off from which.",
      },
    },

    /** LTS 1-4, indexed 0-3. */
    ltsLabels: [
      "Comfortable for anyone",
      "Most adults",
      "Confident riders only",
      "Hostile",
    ] as [string, string, string, string],

    views: {
      gap_score: {
        label: "Opportunity gap",
        hint: "Cycling potential minus infrastructure quality. Positive means the streets serve less than the place's characteristics would support.",
        note: "An index, not a forecast — nobody has measured how many people would cycle here if the streets were fixed. The infrastructure half has been checked against observed cycling and holds; the potential half has not.",
      },
      potential_score: {
        label: "Cycling potential",
        hint: "An index of characteristics associated with cycling — people, destinations, flat ground — before asking whether the roads allow it. A modelling assumption, not measured demand.",
      },
      observed_bicycle_share: {
        label: "Cycling today (measured)",
        hint: "The share of residents' commute and school journeys made by bicycle, from the census. The only measured layer on this map — everything else is modelled.",
        note: "Commute and school trips only, and in this area 55% of them involve a train. The shopping and escort trips a bicycle is best at are not in this data.",
      },
      display_category: {
        label: "Where to invest",
        hint: "The pipeline's own classification: suitability band, upgraded to 'bottleneck' where the network analysis says the segment unlocks connectivity.",
        note: "Red marks a strategic bottleneck — upgrading it would connect otherwise-separated calm areas — not necessarily an unsafe road.",
      },
      lts: {
        label: "Traffic stress",
        metricLabel: "Level of traffic stress",
        hint: "1 = comfortable for anyone, 4 = hostile to all but the confident.",
        note: "Blue turns to red at the LTS 2/3 break — the point where a road stops being usable by most people.",
      },
      infra_gap: {
        label: "Infrastructure gap",
        hint: "High wherever traffic stress reaches LTS 3 or above — the coarse view of the stress score.",
        adequate: "Adequate",
        gap: "Gap",
      },
      island_id: {
        label: "Disconnected networks",
        metricLabel: "Safe network",
        hint: "Each colour is one cluster of low-stress streets that connect to each other but not to the next cluster.",
        note: "Dashed black marks the specific links that would join two clusters into one network.",
      },
    },

    hexRoadSummary: {
      stress_score: {
        label: "Mean traffic stress",
        hint: "Mean level of traffic stress across the roads in the hex (1 calm – 4 hostile).",
      },
      infra_quality_score: {
        label: "Infrastructure quality",
        hint: "Share of the hex's road length that is actually comfortable to cycle.",
      },
    },

    hexSubscores: {
      production_score: {
        label: "Production",
        hint: "Trip-generating potential — people starting journeys here.",
      },
      attraction_score: {
        label: "Attraction",
        hint: "Trip-drawing potential — shops, schools and stations pulling journeys in.",
      },
    },

    hexObserved: {
      observed_bicycle_share: {
        label: "By bicycle",
        hint: "Share of this area's commute and school journeys involving a bicycle, from the census.",
      },
      observed_rail_share: {
        label: "By rail",
        hint: "Shown as context, not as a model input. Rail is the strongest single influence on cycling in the observed data, but the evidence is about commuting only — so it informs how you read the scores rather than entering them.",
      },
      observed_car_share: {
        label: "By car",
        hint: "Share of commute and school journeys by private car.",
      },
      observed_commuters: {
        label: "Commuters & students",
        hint: "Residents aged 15+ who work or study — the denominator for the shares above.",
      },
    },

    hexInputs: {
      population: "Population",
      flat_terrain: { label: "Flat terrain", hilly: "Hilly", flat: "Flat" },
    },

    hexAmenityCounts: {
      schools_nearby: "Schools",
      stations_nearby: "Stations",
      shops_nearby: "Shops & restaurants",
    },

    hexBikeCounts: {
      bike_parking_nearby: "Parking sites",
      bike_parking_capacity_nearby: "Parking spaces",
      bike_sharing_nearby: "Sharing docks",
      bike_sharing_capacity_nearby: "Sharing capacity",
    },

    roiToday: {
      roi_car_trips_per_day: "Car trips",
      roi_congestion_cost_yen_day: "Congestion cost",
      roi_operating_cost_yen_day: "Operating cost",
      roi_emissions_kg_day: "CO₂ emitted",
    },

    roiShifted: {
      roi_shifted_trips_per_day: "Trips shifted",
      roi_congestion_savings_yen_day: "Congestion saved",
      roi_operating_savings_yen_day: "Operating saved",
      roi_emissions_avoided_kg_day: "CO₂ avoided",
      roi_health_benefit_yen_day: "Health benefit",
      roi_parking_spaces_freed: "Parking freed",
    },

    segmentInputs: {
      speed_kmh: "Speed limit",
      lanes_n: "Lanes",
      traffic_signals_count: "Traffic signals",
      has_cycle_infra: {
        label: "Cycle infrastructure",
        none: "None",
        present: "Present",
      },
      cycleway_type: {
        label: "Existing provision",
        hint: "What is already built here. Shared paths are the common Japanese 自転車歩行者道 — legal provision, but shared with people on foot.",
      },
      sidewalk_available: {
        label: "Sidewalk fallback",
        none: "None",
        available: "Available",
      },
      likely_informal_parking: {
        label: "Informal parking",
        unlikely: "Unlikely",
        likely: "Likely",
        hint: "Kerbside parking that pushes riders into traffic — often the deciding factor in the stress score.",
      },
      mean_slope_deg: "Mean slope",
      flat_terrain: { label: "Flat terrain", hilly: "Hilly", flat: "Flat" },
    },

    segmentAction: {
      recommendation: "Intervention",
      cost_tier: "Cost tier",
      estimated_beneficiaries: "Residents within 500 m",
    },

    segmentNetwork: {
      network_criticality_score: {
        label: "Network criticality",
        hint: "How much connectivity the network gains if this segment is upgraded. Best used to rank, not to colour.",
      },
      bridges_islands: "Bridges two networks",
      islands_adjacent: "Adjacent safe networks",
      island_id: "Safe network",
    },
  },

  /** Legend text generated by lib/scales.ts from the data's own distribution. */
  scales: {
    noData: "No data",
    wellServed: (v: string) => `Well served (≤ ${v})`,
    slightlyAhead: "Slightly ahead of demand",
    balanced: "Balanced",
    slightlyUnderserved: "Slightly underserved",
    underserved: (v: string) => `Underserved (≥ ${v})`,
    island: (id: string) => `Island #${id}`,
    otherIslands: "Other islands",
  },

  sidebar: {
    /** Deliberately two lines in the design; the break is the translator's. */
    heading: ["What do you want", "to analyse?"] as [string, string],
    caption:
      "One at a time — each colours the map its own way. Nothing here changes on its own as you move around.",
    overlays: {
      title: "Overlays",
      caption:
        "Drawn on top of any view without taking its colours, so these combine freely. Click anything for detail.",
    },
    toggles: {
      recommendations: {
        label: "Recommendations",
        description: "Segments with a proposed intervention",
      },
      cycleways: {
        label: "Existing cycleways",
        description: "Cycling provision already on the ground",
      },
      amenities: {
        label: "Amenities",
        description: "Schools, stations, shops",
      },
      bike_facilities: {
        label: "Bike facilities",
        description: "Parking and sharing docks",
      },
    },
    sources:
      "Sources: hexagons, segments, cycleways, bike_facilities and amenities GeoJSON (exported by pipeline/scripts/11_export.R).",
  },

  legend: {
    dismiss: "Dismiss",
    title: "Legend",
    /** Heading over the folded overlay swatches — matches sidebar.overlays. */
    overlays: "Overlays",
    collapse: "Hide the legend",
  },

  network: {
    geometry: { areas: "Areas", streets: "Streets" },
    loading: "Loading network data…",
    loadError: (detail: string) =>
      `Could not load map data (${detail}). Re-run pipeline/scripts/11_export.R.`,
    nudge: {
      tooZoomedForAreas: {
        text: "Hexagons cover most of the screen at this zoom.",
        action: "Show street detail",
      },
      tooZoomedForStreets: {
        text: "Individual streets are barely a few pixels at this zoom.",
        action: "Show the area view",
      },
    },
    legend: {
      missingLink: "Missing link between two networks",
      recommendations: {
        title: "Recommendations",
        entry: "Intervention proposed",
      },
      cycleways: {
        title: "Existing cycleways",
      },
      amenities: {
        title: "Amenities",
        school: "School",
        station: "Station",
        shop: "Shop or restaurant",
      },
      bikeFacilities: {
        title: "Bike facilities",
        sharing: "Sharing dock (filled)",
        parking: "Parking (outlined)",
      },
    },
    focus: {
      segments: (n: number) =>
        n === 1 ? "1 segment" : `${n} segments outlined`,
      panelShowsLongest: " · panel shows the longest",
      clear: "Clear project selection",
    },
  },

  panels: {
    segment: {
      fallbackTitle: "Road segment",
      fallbackHighway: "road",
      suitabilityNow: "Suitability now",
      ifBuilt: "If built",
      whyItScores: "Why this street scores as it does",
      networkRole: {
        title: "Network role",
        connectsMany: (n: number) => `Connects ${n} separate safe networks`,
        connectsManyBody:
          "These areas are already calm enough to cycle in, but this segment is the only thing between them. Upgrading it merges them into one usable network.",
        corridorTitle: "On a corridor between separated calm areas",
        corridorBody: (criticality: number) =>
          `Part of a short chain of stressful segments that together sever otherwise-connected safe networks. Connectivity value: ${criticality}/100.`,
        lowPriorityTitle: "Connects little of the network",
        lowPriorityBody:
          "Stressful to cycle, but upgrading it in isolation would not join any separated calm areas — so it ranks below the bottlenecks despite the low score.",
        connectedTitle: "Part of a connected safe network",
        connectedBody:
          "Already comfortable enough to cycle, and joined to a wider calm network rather than stranded on its own.",
        isolatedTitle: "Isolated calm segment",
        isolatedBody:
          "Comfortable in itself, but not connected to a wider calm network — its usefulness depends on the stressful roads around it.",
      },
      proposal: {
        title: "Proposed intervention",
        suitability: "Suitability",
        costTier: "Cost tier",
        beneficiaries: "Beneficiaries",
        people: (n: string) => `~${n} people`,
        na: "N/A",
        naWithLever: (lever: string) => `Not scored: ${lever}.`,
        naGeneric:
          "The traffic-stress score has no input for this intervention, so no after-score is computed.",
      },
    },

    hex: {
      title: "Neighbourhood",
      flat: "Flat terrain",
      hilly: "Hilly",
      seeStreets: {
        label: "See the streets here →",
        hint: "Zooms in and switches the map to per-street scoring.",
      },
      sections: {
        roads: "Roads in this area",
        observed: "Cycling here today (measured)",
        demand: "Why the potential is what it is",
        inputs: "Inputs",
        destinations: "Destinations within reach",
        bikeFacilities: "Bike facilities within reach",
      },
      roi: {
        title: "Return on investment",
        caption: "Modelled for this hex, per day.",
        today: "Today",
        ifShifted: "If shifted",
      },
    },

    facility: {
      parking: "Bike parking",
      sharing: "Bike sharing dock",
      capacity: "Capacity",
      bikes: "bikes",
      spaces: "spaces",
      operation: "Operation",
      brand: "Brand",
      operator: "Operator",
      openingHours: "Opening hours",
      fee: "Fee",
      accessAndShelter: "Access & shelter",
      access: "Access",
      covered: "Covered",
      supervised: "Supervised",
      reference: "Reference",
      osmAmenity: "OSM amenity",
      ref: "Ref",
      note: "Note",
    },

    amenity: {
      kinds: { school: "School", station: "Station", shop: "Shop or restaurant" },
      detail: { school: "Address", station: "Lines", shop: "Type" },
      footnote:
        "Counted in this hex’s destination totals — see the neighbourhood panel for how many are within reach.",
    },
  },

  ranking: {
    title: "Investment Ranking",
    lede: "Fundable projects, ranked. Each row is a corridor — stretches of one street that run end to end into each other and are all worth spending money on — not a single OSM way, so a row is something that can actually be built.",
    tabs: { corridors: "Corridors", areas: "Areas" },

    ledger: {
      cost: (n: number) => `To build all ${n.toLocaleString()} corridors`,
      benefit: "Modelled benefit per year",
      payback: "Pays for itself in",
      caveat:
        "The cost side sums the corridors, which is valid because each is a separate build; the benefit side comes from the area-wide mode-shift scenario, where every resident is counted once — not from adding up the table's own benefit column, whose catchments overlap. Both sides rest on illustrative assumptions, and no sourced schedule of Japanese cycle-infrastructure construction costs was available, so read this as an order of magnitude and a shape of argument, not an appraisal.",
    },
    loadError: (detail: string) =>
      `Could not load investment_ranking.json (${detail}). Run pipeline/scripts/05d_score_interventions.R then 12_compute_investment_ranking.R.`,

    areas: {
      lede: "The strategic overview: areas ranked by missed-opportunity score — the gap between cycling demand and infrastructure quality. Useful for deciding where to look; the Corridors tab is where the fundable items are.",
      columns: {
        rank: "Rank",
        area: "Area",
        gap: "Gap score",
        population: "Population",
        stress: "Stress",
        savings: "Est. daily savings",
      },
      footnote:
        "Yen figures come from score_roi.R’s illustrative 20% mode-shift scenario. Two constants are from MLIT’s official cost-benefit manual; the rest are labelled defaults. Treat them as order-of-magnitude.",
    },

    table: {
      buildHelp: (tier: string) =>
        `Illustrative unit costs — no sourced schedule of Japanese cycle-infrastructure costs was available. Road space escalated this to cost tier ${tier}.`,
      interventionFilter: "Intervention",
      unavailableType:
        "No corridor carries this type — bike parking is a point facility, not a stretch of street.",
      noMatch: "No corridors match that filter.",
      shortHidden: (n: number, m: number) =>
        `${n} corridor${n === 1 ? "" : "s"} under ${m}m not shown — too short to fund as their own scheme. Crossings and island-joining links are listed at any length.`,
      shortShown: (n: number, m: number) =>
        `Including ${n} corridor${n === 1 ? "" : "s"} under ${m}m.`,
      shortShow: "Show them",
      shortHide: "Hide them",
      summary: (rows: number, km: string) =>
        `${rows} corridors · ${km} km · click a row to see it on the map`,
      project: "Project",
      context: "(context)",
      segments: (n: number) => (n === 1 ? "1 segment" : `${n} segments`),
      joinsSevered: "joins severed areas",
      joinsSeveredHelp:
        "Upgrading this would join two otherwise-disconnected low-stress areas.",
      showingTop: (total: number) => `Showing the top 100 of ${total}.`,
      naHelp: (lever: string) =>
        `Not scored: ${lever}. The traffic-stress model has no input for this intervention, so no after-score is shown rather than borrowing another intervention's number.`,
      junctions: (n: number) =>
        n === 1 ? "1 signalised junction" : `${n} signalised junctions`,
      stopsPerKm: (v: string) => `${v} stops/km`,
      kerbsidePressure: (length: string) => `${length} kerbside pressure`,
      columns: {
        lts: {
          label: "LTS now",
          help: "Level of Traffic Stress, 1–4. Length-weighted across the corridor's segments.",
        },
        after: {
          label: "Score after",
          help: "Suitability (0–100) after the recommended intervention, re-scored by the same function that produced the current score. N/A where the intervention is not one the stress model has an input for.",
        },
        beneficiaries: {
          label: "Residents within 500m",
          help: "From a single unioned buffer around the whole corridor, not summed across its segments.",
        },
        length: { label: "Length", help: "" },
        build: {
          label: "Build cost",
          help: "What it would cost to build, as a range. The unit costs behind it are illustrative planning placeholders — unlike the two MLIT figures in the ROI, no published schedule of Japanese cycle-infrastructure costs was found to source them against. Sorted on the low end; never collapse the range to a midpoint.",
        },
        payback: {
          label: "Payback",
          help: "Simple, undiscounted benefit payback period: build cost divided by the modelled annual benefit for this corridor's own residents. Not a benefit-cost ratio or a formal economic appraisal: that needs a discount rate and an appraisal period, which are policy choices this tool has no mandate to set. A screening indicator for comparing corridors, not an MLIT-compliant cost-benefit analysis.",
        },
        gap: {
          label: "Area gap",
          help: "The missed-opportunity score of the ~0.1km² hex this corridor sits in, from hex-level population. Two corridors crossing the same cell show the same figure — it ranks neighbourhoods, not projects.",
        },
        savings: {
          label: "Area ¥/day",
          help: "The enclosing hex's modelled daily benefit under score_roi.R's illustrative 20% mode-shift scenario, for the whole cell. Not attributable to this corridor. Order-of-magnitude only.",
        },
      },
      notes: {
        noScoreLead: "No blended “investment score”, deliberately.",
        noScoreBody:
          "Cost is only ever a rough tier, so a single ranking number would be fake precision. Sort by whichever column matters to the decision you are making and weigh cost against benefit yourself.",
        unmodelledLead: (n: number) =>
          `${n} corridors show N/A for the after-score.`,
        unmodelledBody:
          "The traffic-stress model has no input representing a crossing treatment, so there is no honest way to compute one — those rows state what the intervention does address instead. Traffic calming is scored as a 30km/h zone plus kerbside management, because a speed cap alone moves 195 of 196 of those segments by zero points: they are already posted at 30.",
        contextLead: "The two “area” columns are context, not corridor values.",
        contextBody:
          "Both come from the ~0.1km² hex the corridor sits in, computed from hex-level population, so two corridors crossing the same cell show the same figures.",
      },
    },
  },

  route: {
    pinLabel: (lat: string, lon: string) => `Map pin · ${lat}, ${lon}`,
    hint: "Click anywhere on the map to set the start of the trip, or search for an address on the left.",

    legend: {
      title: "This route · traffic stress",
      notMatched: "Not matched to our data",
      accessLeg: "Pin to the road — on foot",
      noteGraph:
        "The same scale as the network map's stress view — and on this provider, what the router minimised to choose the path.",
      noteExternal: (provider: string) =>
        `The same scale as the network map's stress view. The path itself was chosen by ${provider}'s generic cycling profile, not by these colours.`,
    },

    input: {
      title: "Score a trip",
      caption:
        "Search for an address or click the map to set A, then B. The route comes back coloured by this project’s own traffic-stress data, not by a generic bike layer.",
      start: "Start",
      destination: "Destination",
      searchPlaceholder: "Search or click the map",
      reverse: "Reverse",
      clear: "Clear",
      scoring: "Scoring…",
      cached: "cached",
      cachedHelp:
        "Nearby start and end points share one cached route, so repeating a trip costs no quota.",
      routePreference: "Route preference",
      routeTypes: {
        relaxed: {
          label: "Calm",
          hint: "Avoids stressful roads, accepts a longer trip",
        },
        efficient: {
          label: "Balanced",
          hint: "A sane compromise — the default",
        },
        quick: { label: "Quick", hint: "Shortest time, accepts traffic" },
      },
      routeTypeInert: (provider: string) =>
        `${provider} routes on one generic profile and ignores this — the line will not change. Switch to the graph or BRouter provider to make it count.`,
      whichRoute: "Which route",
      alternatives: {
        original: {
          label: "Original",
          hint: "The best route under this preference",
        },
        first: {
          label: "1st alternative",
          hint: "A different way round, costlier by the router's own reckoning",
        },
      },
      disclosure: {
        title: "What this does and does not do",
        onOurData:
          "The path is chosen on this project’s own network, using its traffic-stress classification as the routing cost — so it does route around a hostile road where a calmer way exists. That classification is modelled from OSM tags, not surveyed, and the detour it is willing to make is a tuned constant. Read the breakdown, not just the total.",
        external: (provider: string) =>
          `The path is chosen by ${provider}’s generic cycling profile, which has never seen this project’s stress, sidewalk or parking data and does not route around a hostile road. This page scores the route it returns — it does not search for a more comfortable one. Read the breakdown, not just the total.`,
        externalFallback: "an external router",
      },
      sources: (provider: string, routeType: string) =>
        `Address search: Photon, over OpenStreetMap, restricted to the study area. Geometry: ${provider}${routeType}. Everything scored on it: segments.geojson and bike_facilities.geojson from pipeline/scripts/11_export.R. Cost and CO₂ units: see lib/scoring-constants.ts.`,
      sourcesProviderFallback: "routing provider",
      clearEnd: (end: string) => `Clear ${end.toLowerCase()}`,
    },

    result: {
      title: "This trip",
      subtitle: (distance: string, streets: number) =>
        `${distance} · ${streets} ${streets === 1 ? "street" : "streets"}`,
      ourEstimate: "Our estimate",
      minutes: "min",
      breakdown: (riding: number, signals: number) =>
        `${riding} riding + ${signals} at signals`,
      genericProfile: "Generic profile, no signals modelled",
      comfort: {
        title: "Comfort along the way",
        note: "Share of the route by traffic stress class. Shown as a breakdown rather than one blended score, because a mostly-calm route with one hostile block is exactly the case an average hides.",
      },
      worst: {
        title: "Worst stretch",
        unnamed: (highway: string) => `Unnamed ${highway}`,
        fallbackHighway: "road",
        reasons: {
          noInfra: "no cycle infrastructure",
          noSidewalk: "no sidewalk to fall back on",
          kerbside: "likely kerbside parking",
          speedLimit: (kmh: number) => `${kmh}km/h limit`,
        },
      },
      exposure: {
        title: "Exposure",
        noSidewalk: {
          label: "No sidewalk to fall back on",
          hint: "Share of the route where there is neither cycle infrastructure nor a footway to retreat to.",
        },
        kerbside: {
          label: "Likely kerbside parking",
          hint: "Parked cars that push a rider out into moving traffic — often the deciding factor in the stress score.",
          value: (share: string, streets: number) =>
            `${share} · ${streets} ${streets === 1 ? "street" : "streets"}`,
        },
        onProvision: "On existing cycle provision",
        junctions: {
          label: "Signalised junctions",
          hint: (seconds: number) =>
            `Junctions the route passes through, not signal heads it passes — OSM tags one per approach. Charged at ${seconds}s each, an illustrative constant.`,
        },
        meanStress: {
          label: "Mean traffic stress",
          hint: "Length-weighted over the matched part of the route. 1 calm, 4 hostile.",
        },
      },
      facilities: {
        title: "At the destination",
        note: "Within 300 m of B — the same radius the hex-level counts use.",
        none: "No bike parking or sharing dock recorded within 300 m. Somewhere to leave the bike is part of whether the trip works.",
        parkingSites: "Bike parking sites",
        sharingDocks: "Sharing docks",
        parking: "Bike parking",
        sharing: "Sharing dock",
        more: (n: number) => `+ ${n} more`,
      },
      poorMatch: {
        title: (share: string) =>
          `${share} of this route matched no street in our data`,
        body: (share: string) =>
          `Everything above describes the ${share} that did match. This usually means the route left the study area or ran along a path our OSM extract does not carry.`,
      },
      car: {
        title: "If you drove this instead",
        caption: (minutes: string) =>
          `~${minutes} by car door to door, at the same effective urban speed the study-area ROI assumes.`,
        timeValue: "Time value",
        runningCost: "Running cost",
        co2: "CO₂",
        healthValue: "Health value of cycling it",
        footnote:
          "¥43.74/min and ¥24.43/km are MLIT’s official appraisal units (令和6年価格). The CO₂ factor and the health value per km are illustrative defaults — see score_roi.R.",
      },
    },

    search: {
      nothingFound:
        "Nothing found inside the study area. Try a landmark or station name, or click the map.",
      unreachable: "Address search is unreachable. Click the map to set this end.",
    },
  },

  /**
   * Failure states, keyed off the discriminants the API already returns.
   *
   * The server's own `message` is a fallback, not the source: it is written
   * once in English on a machine that has no idea who is reading. Translating
   * off `RouteErrorKind` / `GeocodeErrorKind` keeps the wording in the same
   * language as the page around it, and keeps the server free to log detail
   * the reader should never see.
   */
  errors: {
    route: {
      quota: {
        title: "Route service out of quota",
        message:
          "The routing service has hit its daily request limit. Route scoring will work again tomorrow; everything else on the site is unaffected.",
      },
      not_configured: {
        title: "Route service not configured",
        message:
          "The routing service rejected our API key. Check ORS_API_KEY on the server, or set ROUTING_PROVIDER=graph to route on our own network instead.",
      },
      unavailable: {
        title: "Route service unavailable",
        message:
          "The routing service is temporarily unavailable. Try again in a moment.",
      },
      no_route: {
        title: "No route found",
        message:
          "No cycling route could be found between those two points. Try moving one of them nearer a road.",
      },
      out_of_area: {
        title: "Outside the study area",
        message:
          "Both ends of the trip have to be inside the study area — there is no segment data to score against outside it.",
      },
      bad_request: {
        title: "No route found",
        message: "That request could not be read. Try setting both ends again.",
      },
    },
    /** Network-level failure, before any error kind comes back. */
    unreachable: (detail: string) =>
      `Could not reach the scoring endpoint (${detail}).`,
    unknown: "unknown error",
    geocode: {
      unavailable:
        "Address search is unavailable right now. Click the map to set the trip instead.",
      bad_request: "That search could not be run. Try a shorter query.",
    },
  },

  access: {
    km: (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)} km`,
    loadError: (detail: string) =>
      `Could not load the access data (${detail}). Run pipeline/scripts/13_compute_access.R.`,
    hint: "Pick a school or a station. The map shows who can reach it by bicycle — and who can only get there on a high-stress street.",
    studySummary: ({
      km,
      severed,
      share,
    }: {
      km: number;
      severed: string;
      share: number;
    }) =>
      `Across every school in the study area, ${severed} residents live within ${km} km of one but cannot ride there without a high-stress street — ${share}% of everyone in range.`,

    kinds: { school: "Schools", station: "Stations" },
    schoolClasses: {
      elementary: "Elementary",
      junior_high: "Junior high",
      high: "High school",
      international: "International",
    },

    picker: {
      title: "Where to",
      lede: "Ordered by how much of the surrounding population is cut off, worst first.",
      ledeNear: "Nearest first, from the place you searched for.",
      band: "Distance by bicycle",
      empty: "Nothing matches those filters.",
      measuringFrom: "Near",
      clearReference: "Clear the place being measured from",
      directDistance: (d: string) => `${d} away, direct`,
      showOnMap: "Show on map",
      hideOnMap: "Hide from map",
    },

    search: {
      label: "Find a school, station or place",
      placeholder: "School, station, or an address…",
      groupOrigins: "Schools & stations",
      groupPlaces: "Places",
      nothingFound: "Nothing found for that.",
      clear: "Clear the search",
      unreachable:
        "Place search could not be reached. Schools and stations can still be found by name above.",
    },

    legend: {
      title: (km: number) => `Who can reach it within ${km} km`,
      calm: "On low-stress streets",
      severed: "Only on high-stress streets",
      note: (maxLts: number, cellM: number) =>
        `Low-stress means LTS ${maxLts} or below — the same threshold the Network tab colours on. Each square is a ${cellM} m census cell, counted whole or not at all.`,
    },

    panel: {
      unsnapped: (bufferM: number) =>
        `No street in the network comes within ${bufferM} m of this location, so no reach can be measured from it. Usually a mapping gap rather than a finding.`,
      headline: ({
        km,
        any,
        calm,
      }: {
        km: number;
        any: string;
        calm: string;
      }) =>
        `${any} residents live within ${km} km by bicycle. ${calm} of them can ride here without leaving low-stress streets.`,
      severedLabel: "Cut off by the streets in between",
      noCalmAtGate: (maxLts: number) =>
        `Every street at this location is above LTS ${maxLts}. The barrier starts at the gate, not somewhere out in the neighbourhood.`,

      whoTitle: "Within reach — calm / any street",
      residents: "Residents",
      children: "Children (0–14)",
      elderly: "Residents 65+",
      cells: "Census cells",
      cellsHint: (cellM: number, bufferM: number) =>
        `A ${cellM} m cell counts in full when a street comes within ${bufferM} m of its centre, and not at all otherwise.`,

      frontierTitle: "The streets in the way",
      frontierNote: (shown: number, total: number) =>
        total > shown
          ? `The ${shown} longest of ${total} corridors on the edge of the low-stress area.`
          : "Corridors on the edge of the low-stress area — where a cautious rider has to stop.",
      ofWhichChildren: (n: string) => `incl. ${n} children`,
      unlockCaveat:
        "The + figure is how many more residents would reach here on low-stress streets if that corridor were built as the Investment Ranking models it. A counterfactual, not a forecast: it assumes the intervention delivers the stress score the pipeline computes for it, and models nothing about junctions, gradient or one-way streets.",
    },
  },

  meta: {
    home: {
      title: "Norimichi",
      description:
        "Data-driven cycling infrastructure planning for Japanese cities",
    },
    about: {
      title: "About — Norimichi",
      description:
        "What this map measures, how to read it, where the data comes from, and what it does not claim.",
    },
  },
};

export type Dict = typeof en;

export default en;
