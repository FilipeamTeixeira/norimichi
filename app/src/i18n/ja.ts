import type { Dict } from "./en";

/**
 * 日本語 — the same strings as en.ts, typed against it.
 *
 * Terminology follows MLIT's 「安全で快適な自転車利用環境創出ガイドライン」and
 * 「費用便益分析マニュアル」rather than literal translation, because the reader
 * is a Japanese planner who already has words for these things:
 *
 *   cycleway (dedicated)  → 自転車道
 *   shared path           → 自転車歩行者道
 *   on-road lane          → 自転車専用通行帯
 *   traffic calming       → 交通静穏化
 *   corridor              → 路線     (a fundable stretch, not one OSM way)
 *   segment               → 区間
 *   traffic stress (LTS)  → 交通ストレス
 *   informal parking      → 路上駐車
 *
 * Register is ですます for anything that is a sentence and bare noun phrases for
 * labels, which is the ordinary split in Japanese data UI. Field names the
 * pipeline exports (`gap_score`, `segments.geojson`, script filenames) stay in
 * Latin script: they are identifiers a reader has to be able to match against
 * the files, not prose.
 */
const ja: Dict = {
  nav: {
    network: "ネットワーク",
    access: "アクセス",
    route: "ルート分析",
    ranking: "整備優先度",
    about: "本サイトについて",
    language: "言語",
    region: "対象地域",
  },

  common: {
    close: "閉じる",
    clear: "クリア",
    loading: "読み込み中…",
    noData: "データなし",
    yes: "あり",
    no: "なし",
  },

  categories: {
    high: "適性が高い",
    moderate: "中程度",
    bottleneck: "戦略的ボトルネック",
    low_priority: "優先度低",
  },

  cyclewayTypes: {
    dedicated: "自転車道",
    shared_path: "自転車歩行者道",
    on_road: "自転車専用通行帯",
  },

  interventions: {
    "Protected cycle lane": "分離型自転車通行空間",
    "Missing link": "ミッシングリンク",
    "Traffic calming": "交通静穏化",
    "Crossing improvement": "交差点改良",
    "Bike parking": "駐輪場",
  },

  costTiers: {
    Low: "低",
    Medium: "中",
    High: "高",
  },

  corridor: {
    unnamed: (kind: string) => `無名の${kind}`,
    unnamedNear: (kind: string, station: string) =>
      `${station}付近の無名の${kind}`,
    fallbackKind: "道路",
  },

  units: {
    people: "人",
    perDay: "/日",
    kgPerDay: "kg/日",
    spaces: "台",
    kmh: "km/h",
    degrees: "°",
    perHundred: "/ 100",
    metres: (v: number) => `${v} m`,
    km: (v: string) => `${v} km`,
    minutes: (v: number) => `${v}分`,
    // 億・万 rather than the English magnitudes: these are construction
    // figures, and 億円 is how they are written and read in Japanese.
    yenBig: (v: number) =>
      v >= 1e8
        ? `${(v / 1e8).toFixed(1)}億円`
        : v >= 1e4
          ? `${Math.round(v / 1e4).toLocaleString()}万円`
          : `${Math.round(v).toLocaleString()}円`,
    years: (v: string) => `${v}年`,
  },

  metrics: {
    viewGroups: {
      areas: {
        title: "地区",
        caption: "六角形の地区単位。面としてしか存在しない指標です。",
      },
      streets: {
        title: "道路",
        caption:
          "道路区間単位。ズームで見やすさは変わりますが、表示される層は変わりません。",
      },
      network: {
        title: "連続性",
        caption:
          "計測値ではなく識別子です。どの安全な経路がどこから分断されているかを示します。",
      },
    },

    ltsLabels: ["誰でも快適", "多くの大人", "自信のある人のみ", "極めて過酷"],

    views: {
      gap_score: {
        label: "機会ギャップ",
        hint: "自転車ポテンシャルから整備水準を引いた値。正の値は、その地区の特性が支えうる水準に街路が達していないことを意味します。",
        note: "予測ではなく指標です。街路を改善した場合に何人が自転車を使うかを計測したものではありません。整備水準側は実測データと照合して成立していますが、ポテンシャル側は照合できていません。",
      },
      potential_score: {
        label: "自転車ポテンシャル",
        hint: "人口・目的地・平坦性など、自転車利用と関連する特性の指標です。道路条件は考慮しません。実測された需要ではなく、モデル上の仮定です。",
      },
      observed_bicycle_share: {
        label: "現在の自転車利用（実測）",
        hint: "国勢調査による、居住者の通勤・通学トリップのうち自転車を利用する割合です。この地図で唯一の実測レイヤーであり、他はすべてモデルによる推計です。",
        note: "通勤・通学トリップのみが対象で、当地域ではその55%が鉄道を利用しています。自転車が最も適する買い物・送迎などのトリップはこのデータに含まれません。",
      },
      display_category: {
        label: "投資すべき場所",
        hint: "パイプライン自身の分類です。適性区分を基本とし、ネットワーク分析が連続性を生むと判断した区間を「ボトルネック」に格上げしています。",
        note: "赤は戦略的ボトルネック（整備すれば分断された静穏地区がつながる区間）を示すもので、必ずしも危険な道路という意味ではありません。",
      },
      lts: {
        label: "交通ストレス",
        metricLabel: "交通ストレスレベル（LTS）",
        hint: "1 は誰にとっても快適、4 は自信のある人以外には過酷という意味です。",
        note: "青から赤へ変わる境目は LTS 2/3 です。多くの人にとって使えなくなる分岐点にあたります。",
      },
      infra_gap: {
        label: "整備ギャップ",
        hint: "交通ストレスが LTS 3 以上の箇所が「不足」です。ストレススコアを粗く二分した見方にあたります。",
        adequate: "充足",
        gap: "不足",
      },
      island_id: {
        label: "分断されたネットワーク",
        metricLabel: "安全なネットワーク",
        hint: "各色は、互いにつながってはいるものの隣の塊とはつながっていない低ストレス道路の集合です。",
        note: "黒の破線は、2 つの塊を 1 つにつなぐ具体的な区間を示します。",
      },
    },

    hexRoadSummary: {
      stress_score: {
        label: "平均交通ストレス",
        hint: "地区内の道路の平均交通ストレスレベル（1 が静穏、4 が過酷）。",
      },
      infra_quality_score: {
        label: "整備水準",
        hint: "地区内の道路延長のうち、実際に自転車で快適に走れる割合です。",
      },
    },

    hexSubscores: {
      production_score: {
        label: "発生",
        hint: "トリップを生み出す潜在力。ここから出発する人の量です。",
      },
      attraction_score: {
        label: "集中",
        hint: "トリップを引き寄せる潜在力。商店・学校・駅が呼び込む量です。",
      },
    },

    hexObserved: {
      observed_bicycle_share: {
        label: "自転車",
        hint: "国勢調査による、この地区の通勤・通学トリップのうち自転車を利用する割合です。",
      },
      observed_rail_share: {
        label: "鉄道",
        hint: "モデルの入力ではなく参考情報です。実測データ上、鉄道は自転車利用に対する最大の影響要因ですが、その根拠は通勤・通学に限られます。したがってスコアには組み込まず、スコアを読む際の判断材料として示しています。",
      },
      observed_car_share: {
        label: "自家用車",
        hint: "通勤・通学トリップのうち自家用車を利用する割合です。",
      },
      observed_commuters: {
        label: "就業者・通学者",
        hint: "15歳以上の就業者・通学者。上記の割合の分母にあたります。",
      },
    },

    hexInputs: {
      population: "人口",
      flat_terrain: { label: "平坦地", hilly: "起伏あり", flat: "平坦" },
    },

    hexAmenityCounts: {
      schools_nearby: "学校",
      stations_nearby: "駅",
      shops_nearby: "商店・飲食店",
    },

    hexBikeCounts: {
      bike_parking_nearby: "駐輪場",
      bike_parking_capacity_nearby: "駐輪可能台数",
      bike_sharing_nearby: "シェアサイクルポート",
      bike_sharing_capacity_nearby: "シェアサイクル台数",
    },

    roiToday: {
      roi_car_trips_per_day: "自動車トリップ",
      roi_congestion_cost_yen_day: "混雑費用",
      roi_operating_cost_yen_day: "走行費用",
      roi_emissions_kg_day: "CO₂ 排出量",
    },

    roiShifted: {
      roi_shifted_trips_per_day: "転換トリップ",
      roi_congestion_savings_yen_day: "混雑費用の削減",
      roi_operating_savings_yen_day: "走行費用の削減",
      roi_emissions_avoided_kg_day: "CO₂ 削減量",
      roi_health_benefit_yen_day: "健康便益",
      roi_parking_spaces_freed: "駐車場の余剰",
    },

    segmentInputs: {
      speed_kmh: "規制速度",
      lanes_n: "車線数",
      traffic_signals_count: "信号機",
      has_cycle_infra: {
        label: "自転車通行空間",
        none: "なし",
        present: "あり",
      },
      cycleway_type: {
        label: "既存の通行空間",
        hint: "現に整備されているものです。自転車歩行者道は日本で最も一般的な形態で、法的な通行空間ではありますが歩行者と共用です。",
      },
      sidewalk_available: {
        label: "歩道の有無",
        none: "なし",
        available: "あり",
      },
      likely_informal_parking: {
        label: "路上駐車",
        unlikely: "少ない",
        likely: "多い",
        hint: "自転車を車道側へ押し出す路上駐車です。ストレススコアの決め手になることが少なくありません。",
      },
      mean_slope_deg: "平均勾配",
      flat_terrain: { label: "平坦地", hilly: "起伏あり", flat: "平坦" },
    },

    segmentAction: {
      recommendation: "対策",
      cost_tier: "概算費用",
      estimated_beneficiaries: "500 m 圏内の居住者",
    },

    segmentNetwork: {
      network_criticality_score: {
        label: "ネットワーク重要度",
        hint: "この区間を整備した場合にネットワーク全体の連続性がどれだけ増すかを示します。色分けではなく順位付けに向いた指標です。",
      },
      bridges_islands: "2 つのネットワークを接続",
      islands_adjacent: "隣接する安全なネットワーク",
      island_id: "安全なネットワーク",
    },
  },

  scales: {
    noData: "データなし",
    wellServed: (v: string) => `供給が十分（${v} 以下）`,
    slightlyAhead: "やや供給超過",
    balanced: "均衡",
    slightlyUnderserved: "やや供給不足",
    underserved: (v: string) => `供給不足（${v} 以上）`,
    island: (id: string) => `ネットワーク #${id}`,
    otherIslands: "その他",
  },

  sidebar: {
    heading: ["何を", "分析しますか？"],
    caption:
      "一度に 1 つずつ。それぞれが独自の方法で地図を色分けします。地図を動かしても表示が勝手に切り替わることはありません。",
    overlays: {
      title: "重ね合わせ",
      caption:
        "どの表示の上にも、その色を奪わずに描かれます。自由に組み合わせられます。クリックすると詳細が表示されます。",
    },
    toggles: {
      recommendations: {
        label: "対策の提案",
        description: "対策が提案されている区間",
      },
      cycleways: {
        label: "既存の自転車通行空間",
        description: "すでに整備されている通行空間",
      },
      amenities: {
        label: "施設",
        description: "学校・駅・商店",
      },
      bike_facilities: {
        label: "駐輪・シェアサイクル",
        description: "駐輪場とシェアサイクルポート",
      },
    },
    sources:
      "データ出典：hexagons、segments、cycleways、bike_facilities、amenities の各 GeoJSON（pipeline/scripts/11_export.R が出力）。",
  },

  legend: {
    dismiss: "閉じる",
    title: "凡例",
    overlays: "重ね合わせ",
    collapse: "凡例を隠す",
  },

  network: {
    geometry: { areas: "地区", streets: "道路" },
    loading: "ネットワークデータを読み込み中…",
    loadError: (detail: string) =>
      `地図データを読み込めませんでした（${detail}）。pipeline/scripts/11_export.R を再実行してください。`,
    nudge: {
      tooZoomedForAreas: {
        text: "このズームでは六角形が画面のほとんどを覆っています。",
        action: "道路単位で表示",
      },
      tooZoomedForStreets: {
        text: "このズームでは個々の道路が数ピクセルにしかなりません。",
        action: "地区単位で表示",
      },
    },
    legend: {
      missingLink: "2 つのネットワークをつなぐ欠落区間",
      recommendations: {
        title: "対策の提案",
        entry: "対策が提案されている区間",
      },
      cycleways: {
        title: "既存の自転車通行空間",
      },
      amenities: {
        title: "施設",
        school: "学校",
        station: "駅",
        shop: "商店・飲食店",
      },
      bikeFacilities: {
        title: "駐輪・シェアサイクル",
        sharing: "シェアサイクルポート（塗りつぶし）",
        parking: "駐輪場（輪郭のみ）",
      },
    },
    focus: {
      segments: (n: number) => `${n} 区間を強調表示`,
      panelShowsLongest: " · パネルは最長区間を表示",
      clear: "事業の選択を解除",
    },
  },

  panels: {
    segment: {
      fallbackTitle: "道路区間",
      fallbackHighway: "道路",
      suitabilityNow: "現在の適性",
      ifBuilt: "整備後",
      whyItScores: "この評価になる理由",
      networkRole: {
        title: "ネットワーク上の役割",
        connectsMany: (n: number) =>
          `分断された ${n} つの安全なネットワークを接続`,
        connectsManyBody:
          "これらの地区はすでに自転車で走れる静穏さがありますが、その間を隔てているのがこの区間だけです。整備すれば 1 つの使えるネットワークに統合されます。",
        corridorTitle: "分断された静穏地区の間にある経路上",
        corridorBody: (criticality: number) =>
          `本来つながるはずの安全なネットワークを分断している、短いストレス区間の連なりの一部です。連続性への寄与度：${criticality}/100。`,
        lowPriorityTitle: "ネットワークへの寄与が小さい",
        lowPriorityBody:
          "走りにくい道路ではありますが、単独で整備しても分断された静穏地区がつながるわけではありません。評価が低くてもボトルネックより優先度が下がるのはそのためです。",
        connectedTitle: "つながった安全なネットワークの一部",
        connectedBody:
          "自転車で走れる快適さがあり、かつ孤立せず広い静穏ネットワークに接続しています。",
        isolatedTitle: "孤立した静穏区間",
        isolatedBody:
          "区間単体では快適ですが、広い静穏ネットワークにつながっていません。使い勝手は周囲のストレスの高い道路に左右されます。",
      },
      proposal: {
        title: "提案する対策",
        suitability: "適性",
        costTier: "概算費用",
        beneficiaries: "受益者",
        people: (n: string) => `約 ${n} 人`,
        na: "対象外",
        naWithLever: (lever: string) => `評価対象外：${lever}。`,
        naGeneric:
          "交通ストレススコアにはこの対策に対応する入力がないため、整備後の評価値は算出していません。",
      },
    },

    hex: {
      title: "地区",
      flat: "平坦",
      hilly: "起伏あり",
      seeStreets: {
        label: "この地区の道路を見る →",
        hint: "拡大して、道路単位の評価に切り替えます。",
      },
      sections: {
        roads: "この地区の道路",
        observed: "現在の自転車利用（実測）",
        demand: "ポテンシャルの内訳",
        inputs: "入力データ",
        destinations: "到達圏内の目的地",
        bikeFacilities: "到達圏内の駐輪・シェアサイクル",
      },
      roi: {
        title: "費用対効果",
        caption: "この地区について、1 日あたりで推計。",
        today: "現状",
        ifShifted: "転換した場合",
      },
    },

    facility: {
      parking: "駐輪場",
      sharing: "シェアサイクルポート",
      capacity: "収容台数",
      bikes: "台",
      spaces: "台",
      operation: "運営",
      brand: "ブランド",
      operator: "運営者",
      openingHours: "利用時間",
      fee: "有料",
      accessAndShelter: "利用条件・屋根",
      access: "利用条件",
      covered: "屋根",
      supervised: "管理人",
      reference: "参照情報",
      osmAmenity: "OSM amenity",
      ref: "参照番号",
      note: "備考",
    },

    amenity: {
      kinds: { school: "学校", station: "駅", shop: "商店・飲食店" },
      detail: { school: "所在地", station: "路線", shop: "種別" },
      footnote:
        "この地区の目的地数に計上されています。到達圏内にいくつあるかは地区パネルをご覧ください。",
    },
  },

  ranking: {
    title: "整備優先度",
    lede: "事業化できる単位で並べた一覧です。各行は「路線」——同一の街路が端から端までつながり、いずれも投資に値する区間のまとまり——であって、OSM の way 1 本ではありません。だからこそ 1 行が実際に整備できる単位になります。",
    tabs: { corridors: "路線", areas: "地区" },

    ledger: {
      cost: (n: number) => `全${n.toLocaleString()}路線の整備費`,
      benefit: "年間便益（推計）",
      payback: "回収年数",
      caveat:
        "整備費は各路線が独立した事業であるため合計できます。便益側は、住民を重複なく一度だけ数える地域全体の転換シナリオによるもので、表の便益列を合計したものではありません（路線ごとの圏域は重なります）。いずれも目安の前提に基づき、日本の自転車通行空間整備費の公表単価表も確認できていないため、事業評価ではなく桁感と論理の枠組みとしてお読みください。",
    },
    loadError: (detail: string) =>
      `investment_ranking.json を読み込めませんでした（${detail}）。pipeline/scripts/05d_score_interventions.R を実行したうえで 12_compute_investment_ranking.R を実行してください。`,

    areas: {
      lede: "全体像の把握用です。機会損失スコア（自転車需要と整備水準の差）で地区を並べています。どこを見るか決めるのに役立ちますが、事業化できる単位は「路線」タブにあります。",
      columns: {
        rank: "順位",
        area: "地区",
        gap: "ギャップ",
        population: "人口",
        stress: "ストレス",
        savings: "1日あたり便益",
      },
      footnote:
        "金額は score_roi.R の例示的な 20% 転換シナリオによるものです。2 つの原単位は国土交通省の費用便益分析マニュアルに基づきますが、その他は既定値であることを明示しています。オーダーの目安としてご覧ください。",
    },

    table: {
      buildHelp: (tier: string) =>
        `単価は目安値です（日本の自転車通行空間整備費の公表単価表は確認できていません）。道路空間の規模により概算費用区分「${tier}」に相当します。`,
      interventionFilter: "対策",
      unavailableType:
        "この種別に該当する路線はありません。駐輪場は点の施設であり、街路の区間ではないためです。",
      noMatch: "この条件に該当する路線はありません。",
      shortHidden: (n: number, m: number) =>
        `${m}m 未満の ${n} 路線は非表示です。単独の事業とするには短すぎます。交差点改良と地区をつなぐ区間は長さにかかわらず表示します。`,
      shortShown: (n: number, m: number) =>
        `${m}m 未満の ${n} 路線を含めています。`,
      shortShow: "表示する",
      shortHide: "非表示にする",
      summary: (rows: number, km: string) =>
        `${rows} 路線 · ${km} km · 行をクリックすると地図で表示します`,
      project: "事業",
      context: "（参考）",
      segments: (n: number) => `${n} 区間`,
      joinsSevered: "分断地区を接続",
      joinsSeveredHelp:
        "整備すれば、本来つながらない 2 つの低ストレス地区が接続されます。",
      showingTop: (total: number) => `全 ${total} 件のうち上位 100 件を表示。`,
      naHelp: (lever: string) =>
        `評価対象外：${lever}。交通ストレスモデルにはこの対策に対応する入力がありません。他の対策の数値を借りるのではなく、整備後の評価値を示さない扱いにしています。`,
      junctions: (n: number) => `信号交差点 ${n} 箇所`,
      stopsPerKm: (v: string) => `${v} 回/km の停止`,
      kerbsidePressure: (length: string) => `${length} で路上駐車の影響`,
      columns: {
        lts: {
          label: "現在のLTS",
          help: "交通ストレスレベル（1〜4）。路線内の区間を延長で重み付けした値です。",
        },
        after: {
          label: "整備後の評価",
          help: "提案する対策を実施した後の適性（0〜100）。現在値を算出したものと同じ関数で再計算しています。ストレスモデルに対応する入力がない対策は「対象外」です。",
        },
        beneficiaries: {
          label: "500m圏内の居住者",
          help: "路線全体を 1 つに統合したバッファから算出しており、区間ごとの値の単純合計ではありません。",
        },
        length: { label: "延長", help: "" },
        build: {
          label: "整備費",
          help: "整備に要する費用の幅です。単価は計画上の目安値であり、ROIで用いている国土交通省の2つの原単位とは異なり、日本の自転車通行空間整備費の公表単価表を確認できていません。並べ替えは下限値で行います。幅を平均値に丸めないでください。",
        },
        payback: {
          label: "回収年数",
          help: "単純・割引なしの便益回収年数です。整備費を、その路線の周辺住民に対して見込まれる年間便益で割った値です。費用便益比（B/C）や正式な経済評価ではありません。B/Cには割引率と評価期間が必要で、いずれも本ツールが設定する立場にない政策判断です。路線同士を比較するためのスクリーニング指標であり、国交省基準に準拠した費用便益分析ではありません。",
        },
        gap: {
          label: "地区ギャップ",
          help: "この路線が含まれる約 0.1km² の地区の機会損失スコアで、地区単位の人口から算出しています。同じ地区を通る 2 路線は同じ値になります。事業ではなく地区の順位付けです。",
        },
        savings: {
          label: "地区の¥/日",
          help: "路線を含む地区について、score_roi.R の例示的な 20% 転換シナリオで推計した 1 日あたり便益です。地区全体の値であり、この路線に帰属するものではありません。オーダーの目安としてのみご覧ください。",
        },
      },
      notes: {
        noScoreLead: "総合「投資スコア」は意図的に設けていません。",
        noScoreBody:
          "費用はあくまで大まかな区分でしかなく、単一の順位値にすると精度を偽ることになります。ご自身の判断に関わる列で並べ替え、費用と便益はご自身で比較してください。",
        unmodelledLead: (n: number) =>
          `${n} 路線は整備後の評価が「対象外」です。`,
        unmodelledBody:
          "交通ストレスモデルには交差点対策を表す入力がないため、誠実に算出する方法がありません。該当する行には、その対策が何に効くのかを代わりに示しています。交通静穏化は 30km/h ゾーンと路上駐車対策の組み合わせとして評価しています。速度規制だけでは対象 196 区間のうち 195 区間が 0 点しか動かない——すでに 30km/h 規制だからです。",
        contextLead: "「地区」の 2 列は参考値であり、路線の値ではありません。",
        contextBody:
          "いずれも路線が含まれる約 0.1km² の地区について、地区単位の人口から算出した値です。同じ地区を通る 2 路線は同じ数値になります。",
      },
    },
  },

  route: {
    pinLabel: (lat: string, lon: string) => `地図上の地点 · ${lat}, ${lon}`,
    hint: "地図上をクリックすると出発地を設定できます。左側で住所を検索することもできます。",

    legend: {
      title: "このルート · 交通ストレス",
      notMatched: "本データと対応付かない区間",
      accessLeg: "地点から道路まで — 徒歩",
      noteGraph:
        "ネットワーク地図のストレス表示と同じ尺度です。このプロバイダでは、経路選択の際に最小化された指標そのものでもあります。",
      noteExternal: (provider: string) =>
        `ネットワーク地図のストレス表示と同じ尺度です。ただし経路そのものは ${provider} の汎用自転車プロファイルが選んだものであり、この色分けに基づくものではありません。`,
    },

    input: {
      title: "トリップを評価する",
      caption:
        "住所を検索するか地図をクリックして、A と B を設定してください。ルートは汎用の自転車レイヤではなく、本プロジェクト自身の交通ストレスデータで色分けして返します。",
      start: "出発地",
      destination: "目的地",
      searchPlaceholder: "検索するか地図をクリック",
      reverse: "往復を入れ替え",
      clear: "クリア",
      scoring: "評価中…",
      cached: "キャッシュ",
      cachedHelp:
        "近接する出発地・目的地は 1 つのキャッシュを共有するため、同じトリップを繰り返してもリクエスト上限を消費しません。",
      routePreference: "ルートの好み",
      routeTypes: {
        relaxed: {
          label: "静穏重視",
          hint: "ストレスの高い道路を避け、その分の遠回りを許容します",
        },
        efficient: {
          label: "バランス",
          hint: "妥当な折衷案——既定値です",
        },
        quick: { label: "速さ重視", hint: "所要時間を最短にし、交通量は許容します" },
      },
      routeTypeInert: (provider: string) =>
        `${provider} は単一の汎用プロファイルで経路を求めるため、この設定は無視され、線は変わりません。反映させるには graph または BRouter プロバイダに切り替えてください。`,
      whichRoute: "どのルートか",
      alternatives: {
        original: {
          label: "第 1 案",
          hint: "この好みのもとで最良のルート",
        },
        first: {
          label: "第 2 案",
          hint: "別経路。ルーター自身の基準ではより高コストです",
        },
      },
      disclosure: {
        title: "このページができること・できないこと",
        onOurData:
          "経路は本プロジェクト自身のネットワーク上で、交通ストレス分類を経路コストとして選ばれています。したがって、より静穏な道がある場合は過酷な道路を迂回します。ただしこの分類は OSM のタグからのモデル推定であって現地調査によるものではなく、許容する迂回量も調整済みの定数です。合計値だけでなく内訳をご覧ください。",
        external: (provider: string) =>
          `経路は ${provider} の汎用自転車プロファイルが選んだものです。このプロファイルは本プロジェクトのストレス・歩道・駐車データを一切参照しておらず、過酷な道路を迂回することもありません。本ページは返ってきた経路を評価するだけで、より快適な経路を探すことはしません。合計値だけでなく内訳をご覧ください。`,
        externalFallback: "外部ルーター",
      },
      sources: (provider: string, routeType: string) =>
        `住所検索：OpenStreetMap を用いた Photon（対象地域に限定）。経路形状：${provider}${routeType}。評価に用いたデータ：pipeline/scripts/11_export.R が出力する segments.geojson および bike_facilities.geojson。費用と CO₂ の原単位：lib/scoring-constants.ts をご覧ください。`,
      sourcesProviderFallback: "経路プロバイダ",
      clearEnd: (end: string) => `${end}をクリア`,
    },

    result: {
      title: "このトリップ",
      subtitle: (distance: string, streets: number) =>
        `${distance} · ${streets} 街路`,
      ourEstimate: "本サイトの推計",
      minutes: "分",
      breakdown: (riding: number, signals: number) =>
        `走行 ${riding} 分 + 信号待ち ${signals} 分`,
      genericProfile: "汎用プロファイル。信号は考慮されていません",
      comfort: {
        title: "道中の快適さ",
        note: "交通ストレス区分ごとのルート構成比です。単一の総合スコアではなく内訳で示しています。大半が静穏でも 1 区間だけ過酷というケースこそ、平均値が覆い隠してしまうものだからです。",
      },
      worst: {
        title: "最も過酷な区間",
        unnamed: (highway: string) => `無名の${highway}`,
        fallbackHighway: "道路",
        reasons: {
          noInfra: "自転車通行空間なし",
          noSidewalk: "退避できる歩道なし",
          kerbside: "路上駐車が多い",
          speedLimit: (kmh: number) => `規制速度 ${kmh}km/h`,
        },
      },
      exposure: {
        title: "リスクへの露出",
        noSidewalk: {
          label: "退避できる歩道なし",
          hint: "自転車通行空間も、退避できる歩道もない区間がルートに占める割合です。",
        },
        kerbside: {
          label: "路上駐車が多い",
          hint: "自転車を走行車線側へ押し出す駐車車両です。ストレススコアの決め手になることが少なくありません。",
          value: (share: string, streets: number) => `${share} · ${streets} 街路`,
        },
        onProvision: "既存の自転車通行空間上",
        junctions: {
          label: "信号交差点",
          hint: (seconds: number) =>
            `通過する信号機の数ではなく交差点の数です（OSM は流入方向ごとにタグ付けするため）。1 箇所あたり ${seconds} 秒として計上しており、これは例示的な定数です。`,
        },
        meanStress: {
          label: "平均交通ストレス",
          hint: "対応付いた区間について延長で重み付けした値です。1 が静穏、4 が過酷。",
        },
      },
      facilities: {
        title: "目的地周辺",
        note: "B から 300 m 以内。地区単位の集計と同じ半径です。",
        none: "300 m 以内に駐輪場・シェアサイクルポートの記録がありません。自転車を置ける場所があるかどうかは、そのトリップが成立するかの一部です。",
        parkingSites: "駐輪場",
        sharingDocks: "シェアサイクルポート",
        parking: "駐輪場",
        sharing: "シェアサイクルポート",
        more: (n: number) => `他 ${n} 件`,
      },
      poorMatch: {
        title: (share: string) =>
          `このルートの ${share} は本データのどの街路とも対応付きませんでした`,
        body: (share: string) =>
          `上記はすべて、対応付いた ${share} についての値です。多くの場合、ルートが対象地域の外に出たか、本 OSM 抽出データに含まれない経路を通ったことを意味します。`,
      },
      car: {
        title: "自動車で移動した場合",
        caption: (minutes: string) =>
          `ドアツードアで約 ${minutes}。対象地域の費用対効果推計と同じ実効都市内速度によります。`,
        timeValue: "時間価値",
        runningCost: "走行費用",
        co2: "CO₂",
        healthValue: "自転車で走った場合の健康便益",
        footnote:
          "43.74 円/分および 24.43 円/km は国土交通省の公式な原単位です（令和6年価格）。CO₂ 排出係数と km あたりの健康便益は例示的な既定値です——score_roi.R をご覧ください。",
      },
    },

    search: {
      nothingFound:
        "対象地域内に該当がありませんでした。目印になる施設名や駅名でお試しいただくか、地図をクリックしてください。",
      unreachable:
        "住所検索に接続できません。地図をクリックしてこの地点を設定してください。",
    },
  },

  errors: {
    route: {
      quota: {
        title: "経路サービスが利用上限に達しました",
        message:
          "経路サービスが 1 日あたりのリクエスト上限に達しました。ルート評価は翌日に復旧します。サイトのその他の機能には影響ありません。",
      },
      not_configured: {
        title: "経路サービスが未設定です",
        message:
          "経路サービスが API キーを受け付けませんでした。サーバーの ORS_API_KEY をご確認いただくか、ROUTING_PROVIDER=graph を設定して本サイト自身のネットワークで経路探索してください。",
      },
      unavailable: {
        title: "経路サービスを利用できません",
        message:
          "経路サービスが一時的に利用できません。しばらくしてからお試しください。",
      },
      no_route: {
        title: "経路が見つかりません",
        message:
          "この 2 地点間で自転車の経路が見つかりませんでした。いずれかの地点を道路に近づけてお試しください。",
      },
      out_of_area: {
        title: "対象地域外です",
        message:
          "トリップの両端とも対象地域内である必要があります。地域外には評価の基となる区間データがありません。",
      },
      bad_request: {
        title: "経路が見つかりません",
        message:
          "リクエストを解釈できませんでした。両端をもう一度設定してお試しください。",
      },
    },
    unreachable: (detail: string) =>
      `評価エンドポイントに接続できませんでした（${detail}）。`,
    unknown: "原因不明のエラー",
    geocode: {
      unavailable:
        "住所検索は現在ご利用いただけません。地図をクリックしてトリップを設定してください。",
      bad_request:
        "この検索は実行できませんでした。より短い語句でお試しください。",
    },
  },

  access: {
    km: (km: number) => `${km % 1 === 0 ? km : km.toFixed(1)}km`,
    loadError: (detail: string) =>
      `アクセスデータを読み込めませんでした（${detail}）。pipeline/scripts/13_compute_access.R を実行してください。`,
    hint: "学校または駅を選んでください。自転車で通える範囲と、交通ストレスの高い道路を通らなければ行けない範囲を地図に表示します。",
    studySummary: ({
      km,
      severed,
      share,
    }: {
      km: number;
      severed: string;
      share: number;
    }) =>
      `対象地域の学校について、半径${km}km以内に住みながら交通ストレスの高い道路を通らなければ通えない住民は ${severed} 人。到達圏人口の${share}%にあたります。`,

    kinds: { school: "学校", station: "駅" },
    schoolClasses: {
      elementary: "小学校",
      junior_high: "中学校",
      high: "高等学校",
      international: "各種学校",
    },

    picker: {
      title: "目的地",
      lede: "周辺人口のうち安全に到達できない割合が高い順に並んでいます。",
      ledeNear: "検索した地点から近い順に並んでいます。",
      band: "自転車での距離",
      empty: "条件に一致するものがありません。",
      measuringFrom: "起点",
      clearReference: "起点をクリア",
      directDistance: (d: string) => `直線距離 ${d}`,
      showOnMap: "地図に表示",
      hideOnMap: "地図から非表示",
    },

    search: {
      label: "学校・駅・地名を検索",
      placeholder: "学校名、駅名、または住所…",
      groupOrigins: "学校・駅",
      groupPlaces: "地名・住所",
      nothingFound: "該当するものが見つかりませんでした。",
      clear: "検索をクリア",
      unreachable:
        "地名検索に接続できませんでした。学校・駅は上記のとおり名称で検索できます。",
    },

    legend: {
      title: (km: number) => `${km}km以内から到達できる範囲`,
      calm: "低ストレス道路で到達可能",
      severed: "高ストレス道路を通る場合のみ到達可能",
      note: (maxLts: number, cellM: number) =>
        `低ストレスは LTS ${maxLts} 以下 — ネットワークタブの色分けと同じ基準です。1マスは${cellM}mメッシュで、全体を数えるか数えないかのいずれかです。`,
    },

    panel: {
      unsnapped: (bufferM: number) =>
        `この地点から${bufferM}m以内にネットワーク上の道路がないため、到達圏を計測できません。多くの場合、分析結果ではなくマッピングの欠落です。`,
      headline: ({
        km,
        any,
        calm,
      }: {
        km: number;
        any: string;
        calm: string;
      }) =>
        `自転車で${km}km以内には ${any} 人が居住しています。そのうち低ストレス道路だけで到達できるのは ${calm} 人です。`,
      severedLabel: "途中の道路によって分断されている人口",
      noCalmAtGate: (maxLts: number) =>
        `この地点に接するすべての道路が LTS ${maxLts} を超えています。障壁は周辺のどこかではなく、校門・駅前そのものにあります。`,

      whoTitle: "到達圏人口 — 低ストレス／全道路",
      residents: "住民",
      children: "こども（0〜14歳）",
      elderly: "高齢者（65歳以上）",
      cells: "メッシュ数",
      cellsHint: (cellM: number, bufferM: number) =>
        `${cellM}mメッシュは、中心から${bufferM}m以内に道路がある場合にその全人口を計上し、ない場合は計上しません。`,

      frontierTitle: "障壁となっている道路",
      frontierNote: (shown: number, total: number) =>
        total > shown
          ? `低ストレス圏の境界にある${total}路線のうち、延長の長い${shown}路線。`
          : "低ストレス圏の境界にある路線 — 慎重な利用者が進めなくなる場所です。",
      ofWhichChildren: (n: string) => `うちこども ${n} 人`,
      unlockCaveat:
        "「+」は、その路線が整備優先度ページの想定どおりに整備された場合に、低ストレス道路だけで到達できるようになる住民の増加数です。予測ではなく反実仮想であり、パイプラインが算定する整備後の交通ストレス値を前提とし、交差点・勾配・一方通行は考慮していません。",
    },
  },

  meta: {
    home: {
      title: "Norimichi（乗り道）",
      description: "データに基づく、日本の都市のための自転車通行空間の計画",
    },
    about: {
      title: "本サイトについて — Norimichi",
      description:
        "この地図が測っているもの、その読み方、データの出典、そして主張していないことについて。",
    },
  },
};

export default ja;
