import { useEffect } from "react";

const surfaces = [
  ".hero-main > *",
  ".route-visual",
  ".route-story",
  ".section-intro",
  ".condition-list > details",
  ".start-inner > *",
  ".workspace-title",
  ".portfolio",
  ".connect-panel",
  ".setup-strip",
  ".vault-selection",
  ".action-editor",
  ".review-panel",
  ".receipt-status",
  ".receipt-outcome",
  ".receipt-paper",
  ".activity-row",
  ".empty-state",
  ".page-heading",
  ".tools-page > .tool-panel",
  ".tools-page > .tool-route",
  ".tools-page > .tool-actions",
  ".watch-row",
  ".contract-grid > section",
].join(",");

/** Progressive enhancement: content never depends on an observer or animation. */
export function usePageMotion(path: string) {
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main || !window.IntersectionObserver || !Element.prototype.animate)
      return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const seen = new WeakSet<Element>();
    const active = new Map<Element, Animation>();
    const flows = new Set<Element>();
    const flowing = new Set<Element>();
    const updateFlows = () => {
      for (const flow of flows)
        flow.setAttribute(
          "data-flowing",
          String(!preference.matches && !document.hidden && flowing.has(flow)),
        );
    };
    const finish = () => {
      active.forEach((animation) => animation.cancel());
      active.clear();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        for (const entry of entries) {
          if (entry.target.matches(".hero-flow")) {
            if (entry.isIntersecting) flowing.add(entry.target);
            else flowing.delete(entry.target);
            updateFlows();
            continue;
          }
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          if (
            preference.matches ||
            entry.target.contains(document.activeElement)
          )
            continue;
          const animation = entry.target.animate(
            [
              { opacity: 0, transform: "translateY(14px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 520,
              delay: Math.min(order++ * 55, 165),
              easing: "cubic-bezier(.22,1,.36,1)",
              fill: "backwards",
            },
          );
          active.set(entry.target, animation);
          animation.onfinish = animation.oncancel = () =>
            active.delete(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    const register = (node: Element) => {
      const flowCandidates = node.matches(".hero-flow") ? [node] : [];
      flowCandidates.push(...node.querySelectorAll(".hero-flow"));
      for (const flow of flowCandidates) {
        if (flows.has(flow)) continue;
        flows.add(flow);
        observer.observe(flow);
      }
      const candidates = node.matches(surfaces) ? [node] : [];
      candidates.push(...node.querySelectorAll(surfaces));
      for (const target of candidates) {
        if (seen.has(target)) continue;
        seen.add(target);
        if (!preference.matches) observer.observe(target);
      }
    };
    register(main);
    const mutations = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof Element) register(node);
    });
    // Wallet identity changes intentionally remount the entire workspace main.
    // Observe its stable parent so new reviews still get motion after connection.
    mutations.observe(document.body, { childList: true, subtree: true });
    const focused = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      // Never fade or move the control a keyboard user has just reached.
      active.forEach((animation, element) => {
        if (element.contains(event.target as Node)) animation.cancel();
      });
    };
    const changed = () => {
      updateFlows();
      if (preference.matches) {
        finish();
      }
    };
    document.body.addEventListener("focusin", focused);
    document.addEventListener("visibilitychange", updateFlows);
    preference.addEventListener("change", changed);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      finish();
      document.body.removeEventListener("focusin", focused);
      document.removeEventListener("visibilitychange", updateFlows);
      preference.removeEventListener("change", changed);
    };
  }, [path]);
}
