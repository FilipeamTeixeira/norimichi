/**
 * The shell the About page is written in, shared by both language versions.
 *
 * The page is a document, not a UI, and its prose does not survive being cut
 * into dictionary keys: nearly every paragraph carries inline markup — a colour
 * swatch mid-sentence, a bolded lead-in, a link — and a key-value store would
 * either lose it or smuggle HTML into a translation string. So the *structure*
 * lives here, once, and each language writes its own prose against it in
 * content.en.tsx / content.ja.tsx.
 *
 * The cost is that a structural change has to be made twice. That is the right
 * trade for a page whose whole job is to state caveats precisely, and it is
 * bounded: these components are the only structure there is.
 */

export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 mb-12">
      <h2 className="text-base font-semibold text-neutral-900 mb-1.5">
        {title}
      </h2>
      {lede && (
        <p className="text-sm text-neutral-500 leading-relaxed mb-4">{lede}</p>
      )}
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-600 leading-[1.75]">{children}</p>;
}

/** A named field, as the pipeline exports it, with what it actually means. */
export function Term({
  name,
  where,
  children,
}: {
  name: string;
  where?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-neutral-100 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 mb-1">
        <span className="text-[13px] font-semibold text-neutral-900">
          {name}
        </span>
        {where && (
          <span className="text-[10.5px] uppercase tracking-wider text-neutral-400 font-medium">
            {where}
          </span>
        )}
      </div>
      <p className="text-[13px] text-neutral-600 leading-[1.7]">{children}</p>
    </div>
  );
}

export function Card({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] px-5 py-1.5">
      <div className="pt-3.5 pb-1">
        <h3 className="text-[13px] font-semibold text-neutral-900">{title}</h3>
        {caption && (
          <p className="text-[12px] text-neutral-400 leading-relaxed mt-0.5">
            {caption}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** Colour chip, so the legend words are anchored to the colours themselves. */
export function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1.5 -mt-px"
      style={{ backgroundColor: color }}
    />
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3">
      {children}
    </p>
  );
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return (
    <ul className="space-y-3 pl-5 list-disc marker:text-neutral-300">
      {children}
    </ul>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-sm text-neutral-600 leading-[1.75]">{children}</li>
  );
}

/** The bolded lead-in a bullet or paragraph opens with. */
export function Lead({ children }: { children: React.ReactNode }) {
  return (
    <strong className="font-semibold text-neutral-900">{children}</strong>
  );
}

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500"
    >
      {children}
    </a>
  );
}

/** The page header and its jump list. */
export function AboutHeader({
  title,
  lede,
  onThisPage,
  contents,
}: {
  title: string;
  lede: string;
  onThisPage: string;
  contents: readonly (readonly [string, string])[];
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight mb-2">
        {title}
      </h1>
      <p className="text-sm text-neutral-500 leading-relaxed mb-8">{lede}</p>

      <nav className="bg-white rounded-xl border border-[#E5E7EB] px-5 py-4 mb-12">
        <p className="text-[10.5px] uppercase tracking-wider text-neutral-400 font-medium mb-2.5">
          {onThisPage}
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {contents.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-[13px] text-neutral-600 hover:text-neutral-900 underline decoration-neutral-200 underline-offset-4 hover:decoration-neutral-400 transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** The two sourced MLIT unit values. */
export function UnitValues({
  rows,
}: {
  rows: readonly (readonly [string, string, string])[];
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-neutral-100">
      {rows.map(([value, unit, desc]) => (
        <div key={value} className="px-5 py-3.5">
          <p className="text-sm">
            <span className="font-semibold text-neutral-900 tabular-nums">
              {value}
            </span>
            <span className="text-neutral-500"> {unit}</span>
          </p>
          <p className="text-[13px] text-neutral-600 leading-relaxed mt-0.5">
            {desc}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The illustrative-assumptions table. */
export function AssumptionsTable({
  headers,
  rows,
}: {
  headers: readonly [string, string, string];
  rows: readonly (readonly [string, string, string])[];
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#E5E7EB] text-left">
            {headers.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-3 text-[11px] font-medium text-neutral-400 uppercase tracking-wider ${
                  i === 1 ? "text-right whitespace-nowrap" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50 text-neutral-600">
          {rows.map(([name, value, basis]) => (
            <tr key={name}>
              <td className="px-4 py-2.5 text-neutral-700">{name}</td>
              <td className="px-4 py-2.5 text-right font-medium text-neutral-900 tabular-nums whitespace-nowrap">
                {value}
              </td>
              <td className="px-4 py-2.5 text-neutral-500">{basis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
