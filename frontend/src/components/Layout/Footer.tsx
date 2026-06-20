export function Footer() {
  return (
    <footer className="border-t border-surface-border mt-10">
      <div className="max-w-[1600px] mx-auto px-4 py-6 text-xs text-text-faint leading-relaxed space-y-2">
        <p>
          <span className="font-medium text-text-muted">Disclaimer:</span> OptionScope is an informational and
          analytical tool only. All labels (e.g. "Bullish", "Bearish", "Support", "Resistance") are derived,
          rule-based observations on open interest, PCR, Max Pain and implied volatility data — they are{" "}
          <span className="text-text-muted">not</span> trade recommendations, investment advice, or a solicitation
          to buy or sell any security. This tool is not registered with SEBI as an investment adviser or research
          analyst. Options trading carries substantial risk of loss and is not suitable for every investor. Always
          do your own research or consult a SEBI-registered advisor before making investment decisions.
        </p>
        <p>Market data sourced from the Dhan API. Data may be delayed or temporarily unavailable; check the timestamp shown in the dashboard.</p>
      </div>
    </footer>
  );
}
