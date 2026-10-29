import {
  Check,
  type LucideIcon,
  Layers,
  SlidersHorizontal,
  ClipboardCheck,
  Wallet,
} from "lucide-react";
import { t, type CopyKey } from "../copy.js";
import { icon } from "./Shared.js";

export function WithdrawalProgress({ stage }: { stage: number }) {
  const steps: [CopyKey, LucideIcon][] = [
    ["withdrawal.step_position", Layers],
    ["withdrawal.step_amount", SlidersHorizontal],
    ["withdrawal.step_review", ClipboardCheck],
    ["withdrawal.step_confirm", Wallet],
  ];
  return (
    <ol className="withdrawal-progress" aria-label={t("withdrawal.progress")}>
      {steps.map(([label, Icon], index) => (
        <li
          key={label}
          aria-current={index === stage ? "step" : undefined}
          data-complete={index < stage}
        >
          <span>
            {index < stage ? <Check {...icon} /> : <Icon {...icon} />}
          </span>
          {t(label)}
        </li>
      ))}
    </ol>
  );
}
