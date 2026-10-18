import { useFacilityLauncher } from "../facility/launcher";

/** Opens the life-size facility (3D preview or AR). Placed in each mission screen's header. */
export function FacilityButton({ className = "" }: { className?: string }) {
  const open = useFacilityLauncher();
  if (!open) return null;
  return (
    <button type="button" className={`facility-open ${className}`} onClick={open}>
      FACILITY · AR
    </button>
  );
}
