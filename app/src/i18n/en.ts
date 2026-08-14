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
    route: "Route Analysis",
    ranking: "Investment Ranking",
    about: "About",
    searchPlace: "Search place…",
    language: "Language",
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
        label: "Demand / supply gap",
        hint: "Demand minus infrastructure quality. Positive means people want to cycle here and can't.",
      },
      demand_score: {
        label: "Cycling demand",
        hint: "Trips this area should generate and attract, before asking whether the roads allow it.",
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
        note: "Click the street for what to build, its cost tier and who benefits.",
      },
      cycleways: {
        title: "Existing cycleways",
        note: "Most of what exists is shared with people on foot (自転車歩行者道), which is why it is not summed with dedicated provision.",
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
        demand: "Why demand is what it is",
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
      interventionFilter: "Intervention",
      unavailableType:
        "No corridor carries this type — bike parking is a point facility, not a stretch of street.",
      noMatch: "No corridors match that filter.",
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
        cost: { label: "Cost tier", help: "" },
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
