import { type GradeId } from "@/lib/grading";

// 등급을 색만이 아니라 모양으로도 구분한다. 색만으로 나누면 색각 이상이 있는
// 사람에게 최선과 실수가 같아 보인다.
const PATHS: Record<GradeId, React.ReactNode> = {
  best: (
    <>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </>
  ),
  correct: <path d="M20 6 9 17l-5-5" />,
  inaccuracy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5h.01M12 11v5.5" />
    </>
  ),
  wrong: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </>
  ),
  blunder: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9.5v4.5M12 17h.01" />
    </>
  ),
};

export default function GradeIcon({
  id,
  color,
  className = "h-4 w-4",
}: {
  id: GradeId;
  color: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ color }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[id]}
    </svg>
  );
}
