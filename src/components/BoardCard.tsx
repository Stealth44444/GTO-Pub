import type { CSSProperties } from "react";
import type { Suit } from "@/lib/poker";
import Card from "./Card";

// 보드 카드는 실제 딜러가 까는 순서를 따른다.
//
// 카드는 뒷면으로 펠트 위를 미끄러져 와서 마찰로 멈추고, 멈춘 뒤에 뒤집힌다.
// 플랍은 세 장을 한 자리에 겹쳐 놓고 한꺼번에 뒤집은 다음 옆으로 펼친다 —
// 한 장씩 앞면으로 날아오면 카드가 아니라 아이콘처럼 보인다.

/** 펠트 위를 미끄러지는 시간. 초반에 빠르고 끝에서 길게 감속한다. */
const SLIDE_MS = 320;
/** 플랍 세 장이 차례로 놓이는 간격. 한 덩어리로 오되 세 장인 것은 보여야 한다. */
const PILE_GAP_MS = 50;
/** 멈추고 뒤집기 전까지. 바로 뒤집으면 미끄러지던 힘으로 뒤집히는 것처럼 보인다. */
const REST_MS = 40;
const FLIP_MS = 320;
const SPREAD_MS = 280;
/** 스트릿 사이의 쉼. 올인 런아웃처럼 연달아 깔 때만 쓰인다. */
const STREET_GAP_MS = 150;

const FLOP_FLIP_AT = PILE_GAP_MS * 2 + SLIDE_MS + REST_MS;
const FLOP_SPREAD_AT = FLOP_FLIP_AT + FLIP_MS + REST_MS;
const FLOP_TOTAL_MS = FLOP_SPREAD_AT + SPREAD_MS;
const SINGLE_TOTAL_MS = SLIDE_MS + REST_MS + FLIP_MS;

type Schedule = { slideAt: number; flipAt: number; spreadAt: number | null };

/** from은 이미 깔려 있던 장수. 그보다 앞의 카드는 움직이지 않는다. */
function scheduleFor(index: number, from: number): Schedule | null {
  if (index < from) return null;
  if (from === 0 && index < 3) {
    return {
      slideAt: index * PILE_GAP_MS,
      flipAt: FLOP_FLIP_AT,
      spreadAt: index > 0 ? FLOP_SPREAD_AT : null,
    };
  }
  const first = Math.max(from, 3);
  const base =
    (from === 0 ? FLOP_TOTAL_MS + STREET_GAP_MS : 0) +
    (index - first) * (SINGLE_TOTAL_MS + STREET_GAP_MS);
  return { slideAt: base, flipAt: base + SLIDE_MS + REST_MS, spreadAt: null };
}

/**
 * from장이 깔린 보드에 count장을 더 까는 데 걸리는 시간. 마지막 카드가 앞면으로
 * 자리에 놓일 때까지다. 액션 차례는 이게 끝난 뒤에 연다.
 */
export function dealDurationMs(from: number, count: number): number {
  if (count <= 0) return 0;
  const last = scheduleFor(from + count - 1, from);
  if (!last) return 0;
  return last.spreadAt !== null ? FLOP_TOTAL_MS : last.flipAt + FLIP_MS;
}

export default function BoardCard({
  rank,
  suit,
  index,
  dealFrom,
}: {
  rank: string;
  suit: Suit;
  index: number;
  dealFrom: number;
}) {
  const s = scheduleFor(index, dealFrom);
  // 애니메이션이 없는 상태가 곧 최종 상태다. 이미 깔린 카드와 모션 감소 설정은
  // 그대로 제자리에 앞면으로 놓인다.
  const anim = (name: string, ms: number, easing: string, at: number): CSSProperties =>
    s ? { animation: `${name} ${ms}ms ${easing} ${at}ms both` } : {};

  return (
    <div className="relative h-[50px] w-9 flex-shrink-0 sm:h-[58px] sm:w-10">
      <div
        className="absolute inset-0 motion-reduce:!animate-none"
        style={
          {
            "--gw-slot": index < 3 ? index : 0,
            ...(s?.spreadAt != null
              ? anim("gw-board-spread", SPREAD_MS, "cubic-bezier(0.25,0.8,0.3,1)", s.spreadAt)
              : {}),
          } as CSSProperties
        }
      >
        <div
          className="absolute inset-0 motion-reduce:!animate-none"
          style={
            s
              ? {
                  // 플랍 더미는 첫 자리에 쌓인다. 펼치기 전까지 두 번째·세 번째
                  // 카드도 첫 카드 위에서 출발하고 멈춘다.
                  ...anim("gw-board-slide", SLIDE_MS, "cubic-bezier(0.12,0.7,0.2,1)", s.slideAt),
                }
              : undefined
          }
        >
          <div
            className="absolute inset-0 motion-reduce:!animate-none"
            style={{
              transformStyle: "preserve-3d",
              ...anim("gw-board-flip", FLIP_MS, "cubic-bezier(0.45,0,0.3,1)", s?.flipAt ?? 0),
            }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
              <Card rank={rank} suit={suit} />
            </div>
            <div
              aria-hidden
              className="absolute inset-0 rounded-[var(--gw-radius-card)] border border-[var(--gw-border-strong)] bg-[var(--gw-surface-3)] shadow-[var(--gw-card-shadow)]"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgb(151 254 237 / 0.07) 0 3px, transparent 3px 7px)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
