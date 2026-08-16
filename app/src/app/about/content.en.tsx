import {
  AboutHeader,
  AssumptionsTable,
  Bullet,
  Bullets,
  Card,
  ExternalLink,
  Lead,
  Note,
  P,
  Section,
  Swatch,
  Term,
  UnitValues,
} from "./primitives";

/**
 * The page that says what every number on the rest of the site means.
 *
 * Two rules govern what belongs here. First, every variable the UI can put in
 * front of a reader gets an entry — the map, the panels, the ranking table and
 * the route tool between them expose far more fields than the narrative
 * sections mention, and a field a reader can see but not look up is a field
 * that will be misread. The glossary is therefore keyed to the exported
 * property names in pipeline/R/export_geojson.R (mirrored in lib/types.ts),
 * not to a separate vocabulary invented for prose.
 *
 * Second, the split between *sourced* and *illustrative* numbers is stated
 * wherever a number appears, in the same terms score_roi.R's own header uses.
 * That file exists to stop two real MLIT unit values from lending their
 * authority to eight planning assumptions; a page that summarised them all as
 * "our figures" would undo it.
 *
 * content.ja.tsx is the same document in Japanese and has to keep both rules.
 */

const CONTENTS = [
  ["idea", "The idea"],
  ["reading", "How to read the map"],
  ["metrics", "The metrics, explained plainly"],
  ["glossary", "Every field, by where it appears"],
  ["roi", "The numbers behind “return on investment”"],
  ["sources", "Where the data comes from"],
  ["limits", "What this tool doesn’t claim"],
] as const;

const UNIT_VALUES = [
  ["¥43.74", "per minute, per car", "The government’s own value of travel time."],
  [
    "¥24.43",
    "per kilometre, per car",
    "The government’s own estimate of vehicle operating cost (fuel, maintenance) on an urban road.",
  ],
] as const;

const ASSUMPTIONS = [
  ["Trips per person per day", "2.5", "Typical trip-survey range is 2–3"],
  ["Share of trips under ~3 km", "40%", "Illustrative"],
  ["Current car share of those trips", "70%", "Illustrative"],
  ["Average short trip length", "2.0 km", "Illustrative"],
  [
    "Average short car trip time",
    "8 min",
    "Incl. traffic and parking search — an effective 15 km/h",
  ],
  ["Assumed mode shift to bike", "20%", "The scenario, not a forecast"],
  ["CO₂ per car km", "0.13 kg", "Typical tailpipe figure — verify locally"],
  ["Health value per km cycled", "¥15", "Simplified proxy, not a HEAT calculation"],
  [
    "Parking spaces freed per shifted trip",
    "0.02",
    "Peak demand eases incrementally, not 1:1",
  ],
] as const;

export default function AboutContentEn() {
  return (
    <>
      <AboutHeader
        title="About this map"
        lede="Norimichi maps where cycling in a Japanese neighbourhood is being held back by the streets rather than by the people. This page explains what every number on it means, where it came from, and how far it can be trusted. The current study area is Yokohama — Naka, Nishi, Minami and Isogo wards."
        onThisPage="On this page"
        contents={CONTENTS}
      />

      <Section id="idea" title="The idea">
        <P>
          Japan has enormous cycling potential, but in many neighbourhoods, the
          streets themselves get in the way.
        </P>
        <P>
          A bicycle is one of the most effective tools available for short trips
          — the 3 to 5 kilometre journeys that make up a huge share of daily
          travel. It eases traffic congestion, needs a fraction of the space a
          car does, costs far less than continuously widening roads, and gets
          people moving without the ongoing burden of car ownership. It’s also,
          for a lot of people, not a lifestyle choice at all — it’s simply how
          they get to school, to the station, to work, because they don’t have a
          car and don’t want to wait for a bus.
        </P>
        <P>
          This map starts from a simple, deliberately optimistic premise: low
          cycling numbers in a neighbourhood usually aren’t a sign that people
          don’t want to cycle there. They’re often a sign that the streets
          haven’t given them a safe way to.
        </P>
        <P>
          We call this a missed opportunity, not a failure. A neighbourhood with
          flat terrain, a school, a train station, and plenty of daily short
          trips — but hostile, high-traffic streets — isn’t a place where cycling
          failed. It’s a place where infrastructure never caught up to demand
          that was there all along.
        </P>
        <P>
          This tool tries to make that gap visible, and to make the case for
          closing it useful to more than just people who already cycle: parents
          deciding whether their child can ride to school, elderly residents for
          whom a bicycle is real independence, commuters who’d rather not sit in
          traffic, and people for whom a bike isn’t a hobby but their only
          affordable way to get around.
        </P>
      </Section>

      <Section id="reading" title="How to read the map">
        <P>
          Roads are coloured individually, not averaged into neighbourhood
          blocks — <Swatch color="#22c55e" />
          green means comfortable, <Swatch color="#f59e0b" />
          orange means moderate, and <Swatch color="#ef4444" />
          red means something specific: this segment is a strategic bottleneck,
          not necessarily a dangerous one. A short, unremarkable stretch of road
          can still be the single thing standing between two otherwise
          well-connected, comfortable parts of the network. Fixing that one
          segment can do more for the whole area than fixing a dozen minor ones —
          that’s what red is pointing at.
        </P>
        <P>
          There is a fourth colour, and it matters as much as the other three.{" "}
          <Swatch color="#9ca3af" />
          Grey — <em>low priority</em> — is a road that scores just as badly as a
          red one but connects nothing: a stressful cul-de-sac, a service road
          that leads only to itself. Collapsing grey into red would put it on
          equal footing with a critical missing link, which is exactly the
          mistake this map is built to avoid.
        </P>
        <P>
          Areas (hexagons) show the bigger picture underneath the roads: how many
          people live there, how much of a destination it is (shops, schools,
          stations), and — the number the whole map is really built around — the
          gap between how much cycling demand an area has and how much safe
          infrastructure actually exists to serve it. A high-gap area is exactly
          the “missed opportunity” case: real demand, real destinations, roads
          that don’t yet make cycling a realistic choice. Each hexagon is an H3
          resolution-9 cell, roughly 300 m across and about 0.1 km² — a few
          blocks, not a ward.
        </P>
        <P>
          Bike parking and bike-sharing are shown separately, deliberately. A
          parking rack only helps someone who already owns a bicycle. A sharing
          station is itself a way to get around for someone who doesn’t. A
          neighbourhood can have excellent roads, strong demand, and still fall
          short simply because there’s nowhere to leave a bike once you arrive —
          that’s a different kind of gap than a dangerous road, and worth seeing
          on its own.
        </P>
        <Note>
          One layer carries colour at a time. Areas and streets are never both
          coloured at once — hex fills and street lines competing for the same
          colour channel turn into mud — so choosing a view switches which
          geometry is drawn. Zoom is navigation: it changes how legible a layer
          is, never which layer is shown or what its colours mean.
        </Note>
      </Section>

      <Section id="metrics" title="The metrics, explained plainly">
        <P>
          <Lead>Demand</Lead> is split into two halves, because a good cycling
          network needs both: where trips start (how many people live nearby) and
          where trips go (how many destinations — shops, schools, train stations
          — are within realistic cycling distance). A quiet residential street
          and a busy shopping street can both score high on demand, for opposite
          reasons.
        </P>
        <P>
          <Lead>Comfort/stress</Lead> (sometimes shown as a 1–4 or 0–100 score)
          estimates how stressful a given road actually is to cycle on, based on
          things like speed limit, number of lanes, and whether any dedicated
          cycling space exists. It follows a well-established framework used
          internationally for exactly this kind of analysis, adapted for what’s
          realistically knowable from open map data.
        </P>
        <P>
          Two things get tracked separately from that comfort score, on purpose:
        </P>
        <Bullets>
          <Bullet>
            <Lead>Sidewalk availability.</Lead> In many countries, this framework
            assumes cyclists ride in the road. In Japan, cycling on the sidewalk
            — where one exists — is common and often legal, regardless of how
            stressful the road itself is. A stressful road with a sidewalk isn’t
            the same situation as a stressful road with nowhere safe at all; the
            second case is where this map focuses attention first.
          </Bullet>
          <Bullet>
            <Lead>Likely informal parking.</Lead> In many Japanese
            neighbourhoods, drivers commonly stop briefly in a traffic lane to
            visit a shop, restaurant, or laundromat, even where there’s no marked
            parking space. This isn’t something any official dataset records
            directly, so it’s estimated: roads with no protected cycling space
            and a cluster of nearby shops or restaurants are flagged as likely
            affected. It’s a reasoned estimate, not a measurement — worth knowing
            if a specific street’s flag looks surprising.
          </Bullet>
        </Bullets>
        <P>
          <Lead>The gap score</Lead> combines demand with how well the existing
          infrastructure actually serves it. A positive gap means an area is
          underserved relative to how much cycling demand it has — the areas
          worth prioritising first. A negative gap can mean two very different
          things: an area that’s already well served, or an area with genuinely
          low demand — the map is designed so those two very different situations
          don’t get confused with each other.
        </P>
      </Section>

      <Section
        id="glossary"
        title="Every field, by where it appears"
        lede="The sections above cover the ideas. These are the individual numbers you can actually click on, grouped by where in the tool they show up. Names match the exported data, so a figure on screen and its explanation here are the same field."
      >
        <Card
          title="Areas — the hexagons"
          caption="Quantities that only exist over an area. One H3 resolution-9 cell, ~0.1 km²."
        >
          <Term name="Population" where="input">
            Residents in the hexagon, from the national Census mesh apportioned
            onto the hex grid. The single input behind the production side of
            demand and the whole ROI model.
          </Term>
          <Term name="Production score" where="0–1">
            Trip-generating potential — people starting journeys here. The
            residential half of demand.
          </Term>
          <Term name="Attraction score" where="0–1">
            Trip-drawing potential — shops, schools and stations pulling journeys
            in. The destination half of demand.
          </Term>
          <Term name="Cycling demand" where="0–1">
            The two halves combined, plus flat terrain. Deliberately nothing
            else: how many people live here, how many destinations are within
            reach, and whether the ground allows it — all of them independent of
            what the roads are like.
            <br />
            <br />
            It used to carry a fourth term, an allowance for how suppressed
            cycling looks given current road stress, and that was a mistake
            worth naming. The gap score is demand minus infrastructure quality,
            and infrastructure quality is road stress — so stress entered the
            headline number twice, once through each side, both times pushing it
            the same way. It also made the map’s central claim unfalsifiable: if
            suppression is assumed from stress and then compared against stress,
            the map cannot fail to find it. Demand is now measured before the
            roads are looked at, which is what this tooltip always said it was.
            <br />
            <br />
            It is still not measured cycling. No open dataset records trips or
            mode share at this scale in Japan — see “Observed cycling” below for
            the one external figure there is, and the limits at the end of the
            page for what remains unverified.
          </Term>
          <Term name="Observed cycling" where="if available">
            The only measurement in this project. Ward-level mode share for
            commute and school trips from the national census, where it has been
            entered — everything else on this page is derived from population,
            map data and stated assumptions.
            <br />
            <br />
            It is reported next to the modelled figures and deliberately not
            fitted to them. Four wards cannot estimate a three-weight model, and
            cycling demand is a 0–1 rescale across the hexes in a run — a
            ranking device, not a rate — so there is no defensible transform
            between the two. It is also not substituted into the ROI’s
            short-trip car share: commute trips are a different, longer, far
            more rail-heavy population than the trips that model is about.
          </Term>
          <Term name="Mean traffic stress" where="1–4">
            The average stress class of the roads inside the hexagon: 1 calm, 4
            hostile. A rollup of the street data, not a separate measurement,
            which is why it is a panel row and not its own map layer.
          </Term>
          <Term name="Infrastructure quality" where="0–1">
            The same rollup read the other way: how much of the hexagon’s road
            length is genuinely comfortable to cycle. This is the supply side of
            the gap score.
          </Term>
          <Term name="Demand / supply gap" where="−1 to +1">
            Demand minus infrastructure quality. Positive means people want to
            cycle here and can’t. This is the missed-opportunity number the whole
            map is built around.
          </Term>
          <Term name="Flat terrain">
            Whether the hexagon is flat enough that terrain isn’t itself the
            barrier, derived from the national elevation model. Hilly areas
            aren’t written off — the flag exists so a low-cycling hilly
            neighbourhood isn’t mistaken for a neglected flat one.
          </Term>
          <Term name="Schools, stations, shops nearby" where="counts">
            Destinations within cycling reach of the hexagon. These are the
            inputs to the attraction score, shown as raw counts so you can see
            what drove it.
          </Term>
          <Term name="Parking sites / parking spaces" where="counts">
            Bike parking locations within 300 m, and their total capacity where
            OSM records it. Sites and spaces are separate because one large
            station-side facility and twelve street racks are different
            situations.
          </Term>
          <Term name="Sharing docks / sharing capacity" where="counts">
            Bike-sharing stations within 300 m and their capacity, counted apart
            from parking throughout: parking serves people who already own a
            bike, sharing serves people who don’t.
          </Term>
        </Card>

        <Card
          title="Streets — one road segment"
          caption="Why this specific stretch is the colour it is."
        >
          <Term name="Where to invest" where="map view">
            The four categories the colours encode: high suitability (green),
            moderate (orange), strategic bottleneck (red) and low priority
            (grey). The red/grey split is decided by the network analysis, not by
            the score — see “Network criticality” below.
          </Term>
          <Term name="Level of traffic stress (LTS)" where="1–4">
            The standard four-class stress classification: 1 comfortable for
            anyone, 2 most adults, 3 confident riders only, 4 hostile. Built from
            speed limit, lane count, existing cycle provision and the
            informal-parking flag. The 2/3 break is the meaningful one — it is
            where a road stops being usable by most people.
          </Term>
          <Term name="Suitability score" where="0–100">
            The same judgement rescaled so higher is better, with one addition: a
            segment that has neither cycle infrastructure nor a sidewalk to fall
            back on loses a further 10 points, because there is nowhere safe to
            ride at all. That penalty is the only difference between this and a
            straight conversion of LTS.
          </Term>
          <Term name="Infrastructure gap" where="adequate / gap">
            A deliberately coarse two-way cut of the same score: “gap” wherever
            stress reaches LTS 3 or worse. Useful for a quick overview; the
            stress and suitability fields are what to read for anything specific.
          </Term>
          <Term name="Existing provision" where="type">
            What is already built: a dedicated cycleway, an on-road lane, or a
            shared bike/pedestrian path — the common Japanese 自転車歩行者道.
            These are never added into a single “cycle route km” figure. Shared
            paths are legal provision and are most of what exists, but counting
            them as dedicated infrastructure is how a network gets overstated.
          </Term>
          <Term name="Speed limit, lanes, traffic signals">
            The raw OSM inputs to the stress score, shown so a surprising colour
            can be traced back. Where a road has no posted speed in OSM, a class
            default is assumed — 30 km/h for a residential street, 50 km/h for a
            trunk road.
          </Term>
          <Term name="Sidewalk fallback / informal parking">
            The two flags described above, carried per segment. Informal parking
            already feeds into the stress score itself; the sidewalk flag
            deliberately does not, and is folded into the suitability score
            instead.
          </Term>
          <Term name="Mean slope / flat terrain">
            Segment gradient from the national elevation model. Missing on part
            of the network, so it informs reading rather than scoring.
          </Term>
          <Term name="Network criticality" where="0–100">
            How much connectivity the whole network gains if this one segment is
            upgraded. This is what separates a red bottleneck from a grey
            low-priority road: both ride badly, only one of them is in the way of
            everything else. Best used to rank segments against each other, not
            read as an absolute.
          </Term>
          <Term name="Bridges two networks / adjacent safe networks">
            Whether upgrading this single segment would directly join two
            otherwise-separated calm areas, and how many such areas it touches.
            The most concrete form the criticality argument takes.
          </Term>
          <Term name="Safe network (disconnected networks view)">
            Each colour in that view is one cluster of low-stress streets that
            connect to each other but not to the next cluster. It is an identity,
            not a measurement — cluster 7 is not better or worse than cluster 3.
            Dashed black marks the specific links that would join two clusters
            into one network.
          </Term>
          <Term name="Recommendation" where="5 types">
            What to build: protected cycle lane, missing link, traffic calming,
            crossing improvement, or bike parking. Assigned from the segment’s
            own attributes, and inherited from the corridor it belongs to so that
            one street doesn’t end up with five different prescriptions along its
            length.
          </Term>
          <Term name="Cost tier" where="Low / Medium / High">
            A relative build-cost band, not a price. The intervention type sets
            the base and road space escalates it — a protected lane across six
            lanes is not the same project as one across two, while a crossing
            treatment costs about the same however wide the road.
          </Term>

          <Term name="Build cost" where="a range, in yen">
            What the corridor would cost to build. The intervention type sets a
            rate — per metre for a lane or a calming scheme, per junction for a
            crossing — the cost tier above escalates it for road space, and
            length does the rest.
            <br />
            <br />
            <strong>None of those unit rates is sourced.</strong> The two unit
            values in the ROI below come from MLIT’s own cost-benefit manual;
            for construction costs there is no equivalent published schedule
            this project has been able to find and verify, so these are
            order-of-magnitude planning placeholders chosen to be defensible as
            ranges rather than accurate as numbers. That is why the column
            shows a range and never a midpoint, and why the range is wide.
            Replacing them with real tendered costs is a single edit to
            <code> pipeline/R/score_cost.R</code>.
          </Term>
          <Term name="Payback" where="years">
            A simple, undiscounted benefit payback period: the build cost
            divided by the modelled annual benefit for the residents within
            500 m of that corridor — congestion, vehicle operating cost and
            the health proxy, under the same illustrative 20% mode-shift
            scenario as everything else here.
            <br />
            <br />
            Two things it is not. It is not a benefit-cost ratio or a formal
            economic appraisal: a BCR needs a discount rate and an appraisal
            period, and both are policy choices this tool has no mandate to
            make — payback needs neither. Treat it as a screening indicator
            for comparing corridors against each other, not an MLIT-compliant
            cost-benefit analysis. And a corridor’s benefit is not additive —
            it credits the whole of that neighbourhood’s modelled shift to
            this one street, so where several corridors serve the same
            residents each is an upper bound. Never add the column up. The one
            total that is safe to quote is the ledger above the table, whose
            benefit comes from the hex grid, where each resident is counted
            exactly once.
          </Term>
          <Term name="Residents within 500 m">
            Who a fix would plausibly serve. For a corridor this is recomputed
            from one merged buffer around the whole street, never the sum of its
            segments — their 500 m buffers overlap almost entirely, and summing
            them overstates the population by more than tenfold.
          </Term>
          <Term name="Before → after suitability">
            What the score becomes if the recommended intervention is built,
            produced by editing the road’s attributes and re-running the same
            scoring — not by asserting an improvement. Some interventions have no
            honest before/after at all, which is the next entry.
          </Term>
          <Term name="“Benefit not modelled”">
            Shown instead of an arrow for crossing improvements and bike parking.
            The stress score has no junction or parking term, so there is no edit
            to a road that means “the crossing got safer”. Rather than score one
            intervention by pretending a different one was built, the tool states
            the benefit in other terms — for a crossing scheme, the number of
            signalised junctions involved.
          </Term>
          <Term name="Neighbourhood context">
            Gap score, demand, population and daily savings for the hexagon a
            street sits in. Context — “what kind of area is this street in” —
            never a claim about what fixing that street is worth. Those figures
            are computed for a whole ~0.1 km² cell.
          </Term>
        </Card>

        <Card
          title="Investment Ranking — corridors"
          caption="A row is a fundable project, not a database record."
        >
          <Term name="Corridor">
            Stretches of one street that run end to end into each other and are
            all worth spending money on, grouped into a single row. The median
            recommended road segment here is about 120 m and more than half are
            unnamed, so a segment-level table would rank fragments of the same
            few streets and leave most rows blank. A corridor is something that
            can actually be built.
          </Term>
          <Term name="Corridor name">
            The street name covering most of the corridor’s length — a named
            stretch absorbs the unnamed ones it runs straight into. About half of
            corridors have no name in OSM at all; those are labelled by their
            nearest station instead.
          </Term>
          <Term name="Signalised junctions / signals per km">
            Distinct junctions along the corridor, with OSM’s per-approach signal
            nodes clustered so a crossroads counts once. The rate matters more
            than the count: a signal every 100 m is a bad ride whatever the
            stress score says, and an absolute count just scales with how long a
            street happens to be.
          </Term>
          <Term name="Informal parking length / no-sidewalk length">
            How many metres of the corridor carry each flag. Useful for sizing a
            kerbside-management scheme, and for seeing whether a flag applies to
            the whole street or one block of it.
          </Term>
          <Term name="Est. daily savings">
            The ROI figures below, for the corridor’s surrounding area.
            Neighbourhood context, on the same caveat as above.
          </Term>
        </Card>

        <Card
          title="Route Analysis — one journey"
          caption="The same argument, made about a trip instead of a street."
        >
          <Term name="Comfort breakdown">
            The share of the route in each of the four stress classes, as a
            stacked bar, plus the worst stretch named. Deliberately not one
            blended score: a 4 km ride that is 90% calm with one hostile block
            averages out to “moderate”, and that bad block is the whole reason
            somebody doesn’t make the trip.
          </Term>
          <Term name="Route preference" where="Calm / Balanced / Quick">
            How much detour the router will accept to avoid stressful roads. Calm
            will ride substantially further to stay off a hostile arterial; Quick
            barely weighs stress at all. The relative ordering is defensible; the
            exact detour factors are starting values, not calibrated against
            observed route choice.
          </Term>
          <Term name="Our estimate vs. the provider’s">
            Two travel times, neither presented as the answer. The provider’s is
            a generic cycling profile that models no junctions at all; ours rides
            slower on the roads this map’s own data calls hostile and then
            charges about 18 seconds per signalised junction. The gap between
            them is the finding. When the route was chosen on this map’s own
            data, only one estimate is shown — a second column would be the same
            number twice.
          </Term>
          <Term name="If you drove instead">
            The same trip costed as a car journey, using the two official unit
            values below, plus the CO₂ and the health value of cycling it. Not a
            claim that this trip would have been driven — it is what makes a
            single journey legible in the same units as the area-level ROI.
          </Term>
          <Term name="Access legs">
            The dashed line between where you dropped a pin and where the route
            actually starts. Every router snaps to the nearest thing it can route
            along; showing the difference means it reads as “walk this bit”
            rather than as a route drawn in the wrong place.
          </Term>
          <Term name="Facilities at the destination">
            Bike parking and sharing docks within 300 m of where you’re going —
            the same radius the hexagon counts use, so the two agree about what
            “nearby” means.
          </Term>
        </Card>

        <Card
          title="Access — who can reach a school or a station"
          caption="The same measurement taken from a destination rather than about a street: how far you can get, and how much of that disappears if you refuse to ride anything hostile."
        >
          <Term name="Which schools are listed" where="小 / 中 / 高 / 各種">
            Elementary, junior high, high schools, and 各種学校 — which in this
            area is the international and ethnic schools, ordinary day schools
            whose pupils commute locally. Kindergartens and 認定こども園 are
            left out because nobody cycles to them unaccompanied; universities
            and 専修学校 because their catchment is regional and post-secondary,
            so a 5 km surface around one says little; 特別支援学校 because its
            pupils’ journeys are overwhelmingly not made by bicycle, and a
            number beside one of those schools would mean something else.
          </Term>
          <Term name="Distance by bicycle" where="1.5 / 3 / 5 km">
            Metres of riding, not straight-line radius. A school hemmed in by a
            river or a rail line reaches far less ground than a circle around it
            would claim, and that difference is often the finding. 1.5 km is
            roughly the walking catchment a 通学区域 is drawn at; 3 and 5 km are
            the trip lengths a bicycle beats a car over.
          </Term>
          <Term name="On low-stress streets" where="map, blue">
            A 250 m census cell whose residents can reach the selected place
            using only LTS 1–2 streets. The same threshold the Network tab
            colours on, and the same one that defines a “safe network” there —
            an origin’s low-stress reach is a distance-limited slice of the safe
            network it sits on, not a separate calculation.
          </Term>
          <Term name="Only on high-stress streets" where="map, red">
            A cell within reach, but not without riding LTS 3 or 4 somewhere
            along the way. Not a claim that nobody makes the trip — a claim that
            making it means accepting a road most people won’t put a child on.
          </Term>
          <Term name="Cut off by the streets in between" where="count and %">
            The difference between the two. Quote the percentage in preference
            to the count: both surfaces are measured with the same buffer, the
            same mesh and the same network, so every arbitrary constant cancels
            out of the ratio and none of them cancels out of the totals.
          </Term>
          <Term name="Residents, children, 65+">
            From the national Census 250 m mesh, counted whole. A cell counts in
            full when a street comes within 150 m of its centre, and not at all
            otherwise — deliberately binary, because area-weighting would imply
            we know how a cell’s residents are distributed inside it, and the
            250 m mesh is the finest thing e-Stat publishes. The age rows appear
            only if the source table for this run carried those bands.
          </Term>
          <Term name="The streets in the way" where="corridor list">
            Corridors on the edge of the low-stress area — where a cautious
            rider has to stop. Each one is a row on the Investment Ranking, and
            clicking it opens that corridor on the Network map, so “who is cut
            off” and “what would it cost” are the same object seen twice.
          </Term>
          <Term name="+N residents" where="counterfactual">
            How many more people would reach the place on low-stress streets if
            that corridor were built as the Investment Ranking models it. The
            low-stress network is recomputed with that corridor’s stress removed
            and the two surfaces subtracted. It inherits every limit of the
            before/after numbers above — it assumes the intervention delivers
            the stress score the pipeline computes for it, and it models nothing
            about junctions, gradient or one-way streets. Corridors whose
            benefit is “not modelled” never appear in this list at all, so there
            is no case where a number here stands on an intervention that was
            never simulated.
          </Term>
          <Term name="“… away, direct”" where="list only">
            The one straight-line distance on this page. Searching for a place
            re-sorts the list to the schools and stations nearest it, and that
            ordering is measured as the crow flies — sorting 135 origins by
            network distance would mean routing from every one of them, to
            decide a list order. Everything else here, including every band and
            every population figure, is metres of riding. Labelled “direct” so
            the two are never read as the same number.
          </Term>
          <Term name="No low-stress street at the gate">
            Every street touching the school or station is itself LTS 3 or 4.
            Worth separating from a low reach figure: the barrier is the first
            street you meet, not something out in the neighbourhood, and it is
            usually a much smaller thing to fix.
          </Term>
        </Card>
      </Section>

      <Section id="roi" title="The numbers behind “return on investment”">
        <P>
          Where the map shows potential savings from improving cycling
          infrastructure — reduced congestion, lower emissions, health benefits —
          two specific figures come directly from Japan’s own official
          cost-benefit methodology, the same standard used to evaluate road
          projects nationally (令和6年 price level):
        </P>
        <UnitValues rows={UNIT_VALUES} />
        <P>
          Everything else feeding into these estimates — how many short trips
          people make per day, what share currently go by car, average trip
          length, the health value of a kilometre cycled instead of driven, how
          many parking spaces a shifted trip frees up — is an explicitly
          illustrative assumption, not a measurement. There’s no open dataset
          that records actual trip counts or mode share at neighbourhood level in
          Japan today, so reasonable, round, clearly-labelled planning
          assumptions fill that gap instead. They are stated here in full rather
          than buried, so you can see exactly what a yen figure is standing on:
        </P>
        <AssumptionsTable
          headers={["Assumption", "Value", "Basis"]}
          rows={ASSUMPTIONS}
        />
        <P>
          The panels report this as two columns: what driving in an area costs
          today (car trips, congestion cost, operating cost, CO₂ emitted), and
          what shifting a share of it to bikes would return (trips shifted,
          congestion saved, operating cost saved, CO₂ avoided, health benefit,
          parking spaces freed). Both columns rest on the same assumptions, so
          the ratio between them is far more robust than either number alone.
        </P>
        <P>
          What this means in practice: treat the resulting yen figures as
          order-of-magnitude — genuinely useful for comparing one area against
          another, and for making the case that a neighbourhood’s cycling
          potential is meaningful rather than trivial, but not as an audit-ready
          cost-benefit analysis you’d submit to a funding body without further
          work. For a properly rigorous health-benefit calculation specifically,
          the World Health Organization’s own HEAT tool (
          <ExternalLink href="https://heatwalkingcycling.org">
            heatwalkingcycling.org
          </ExternalLink>
          ) is the right instrument — this map’s health estimate is a simplified
          proxy, not a substitute for it.
        </P>
      </Section>

      <Section id="sources" title="Where the data comes from">
        <Bullets>
          <Bullet>
            <Lead>
              Road network, footpaths, traffic signals, shops, and bike
              parking/sharing
            </Lead>{" "}
            — OpenStreetMap, a crowd-sourced map maintained by volunteers.
            Coverage is generally strong for roads, but varies for smaller
            details like bike racks — some neighbourhoods have been carefully
            surveyed, others haven’t, so a low count in a specific area may
            reflect mapping coverage rather than reality on the ground.
          </Bullet>
          <Bullet>
            <Lead>Population</Lead> — Japan’s official Census mesh statistics
            (e-Stat), published by the national statistics bureau.
          </Bullet>
          <Bullet>
            <Lead>Schools and train stations</Lead> — 国土数値情報 (National Land
            Numerical Information), an official government geospatial dataset,
            cross-checked against OpenStreetMap.
          </Bullet>
          <Bullet>
            <Lead>Terrain and slope</Lead> — the Geospatial Information Authority
            of Japan’s official elevation model.
          </Bullet>
        </Bullets>
        <Note>
          Which roads count as the network is a decision, not a given. Ways
          cyclable by default are included, plus shared bike/pedestrian paths a
          bicycle tag admits, minus anything explicitly barred to bicycles or
          marked as motor-vehicle-only. National-route “trunk” roads are
          included: in Japan that tag marks a road’s place in the route
          hierarchy, not what kind of facility it is, and excluding the class
          silently dropped 42 km of ordinary named street — much of it
          mid-corridor, leaving otherwise-connected streets unable to touch.
        </Note>
      </Section>

      <Section id="limits" title="What this tool doesn’t claim">
        <P>
          In the same spirit as everything above: a few honest limits, stated
          plainly rather than left implicit.
        </P>
        <Bullets>
          <Bullet>
            The comfort/stress score is a reasoned estimate from map data, not a
            measured safety record or an accident history.
          </Bullet>
          <Bullet>
            The informal-parking flag is a calibrated guess based on nearby shop
            density, not an observed count of actual parked cars.
          </Bullet>
          <Bullet>
            Demand is modelled, not measured. It is built from population,
            destinations and terrain — none of which depends on the roads, so
            the gap score is a comparison of two independent quantities rather
            than of one input against itself. But nothing here is calibrated
            against how much people actually cycle: no open dataset records
            trips or mode share at hexagon scale in Japan, and the ward-level
            census figure the tool can carry is an external check, not a fit. A
            high gap score means the model expects demand the streets don’t
            serve. It does not mean anyone has counted the bicycles.
          </Bullet>
          <Bullet>
            Routing happens on this map’s own stress data by default: the Calm /
            Balanced / Quick preference genuinely changes which roads a route
            uses. But one-way streets aren’t modelled, gradient is ignored, and
            signal delay is charged after the route is chosen rather than
            influencing the choice — so a proposed route can occasionally run the
            wrong way up a one-way street or take an unnecessarily signal-heavy
            line. If an instance is configured to use an external routing service
            instead, that route is a generic cycling profile scored after the
            fact, and the preference control says so rather than implying it was
            honoured.
          </Bullet>
          <Bullet>
            Corridor-level and route-level figures are attributable to the thing
            they describe; the neighbourhood figures shown beside them (gap
            score, daily savings) are context for the surrounding hexagon and are
            not a claim about what fixing that street is worth.
          </Bullet>
          <Bullet>
            The financial figures mix two real, sourced government numbers with
            several clearly-labelled planning assumptions. They’re built to
            support a conversation about priorities, not to stand alone as a
            certified economic appraisal.
          </Bullet>
        </Bullets>
        <P>
          If any of this changes — a real local trip-count survey to replace an
          assumption, one-way and gradient data in the routing graph, better
          bike-parking mapping coverage — this page should be the first thing
          updated to reflect it.
        </P>
      </Section>
    </>
  );
}
