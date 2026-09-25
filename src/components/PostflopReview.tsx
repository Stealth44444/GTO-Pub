"use client";

import { useEffect, useState } from "react";
import { ensureGuestUser, logReview } from "@/lib/attempts";
import { makeDecision } from "@/lib/decisions";
import { fromNode } from "@/lib/rangeGrid";
import type { PostflopReviewSpot } from "@/lib/review";
import { STREET_KO } from "@/lib/review";
import { SEATS_DATA } from "@/lib/seatsData";
import { currentUserId } from "@/lib/session";
import { loadSpotFile } from "@/lib/spotLibrary";
import { ACTION_KO } from "@/lib/stats";
import { formatEvLoss } from "@/lib/grading";
import type { Suit } from "@/lib/poker";
import { actionEvFor, actionLabel, findNode, handIndex, type SolvedSpot } from "@/lib/tree";
import Card from "./Card";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";

const DATA = SEATS_DATA;

type Loaded =
  | { status: "loading" }
  | { status: "failed"; why: string }
  | { status: "ready"; spot: SolvedSpot };

/**
 * 플랍 이후에 틀렸던 자리를 그대로 다시 세운다.
 *
 * 기록에 남은 보드 파일과 라인으로 노드를 찾고, 그때 들고 있던 두 장의 EV를
 * 읽는다. 트레이너와 같은 값을 쓰므로 여기서 맞춘 것은 실제 판에서도 맞는다.
 */
export default function PostflopReview({
  spot,
  onNext,
}: {
  spot: PostflopReviewSpot;
  onNext: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [picked, setPicked] = useState<number | null>(null);

  // 스팟이 바뀌면 부모가 key로 이 컴포넌트를 새로 만든다. 그래서 여기서
  // 상태를 되돌릴 필요가 없고, 되돌리면 렌더가 한 번 더 도는 것으로만 남는다.
  useEffect(() => {
    let alive = true;
    loadSpotFile(spot.spotFile)
      .then((s) => {
        if (alive) setLoaded({ status: "ready", spot: s });
      })
      .catch(() => {
        // 보드 파일은 데이터를 다시 만들 때 이름이 바뀔 수 있다. 그러면 이
        // 기록은 되살릴 수 없고, 다음 스팟으로 넘기는 것 말고 할 일이 없다.
        if (alive) setLoaded({ status: "failed", why: "이 보드는 더 이상 없습니다." });
      });
    return () => {
      alive = false;
    };
  }, [spot.spotFile]);

  if (loaded.status === "loading") {
    return <Shell spot={spot} body={<Note>보드를 불러오는 중입니다.</Note>} onNext={onNext} />;
  }
  if (loaded.status === "failed") {
    return <Shell spot={spot} body={<Note>{loaded.why}</Note>} onNext={onNext} />;
  }

  const node = findNode(loaded.spot, spot.line);
  const handIdx = node ? handIndex(loaded.spot, spot.heroPlayer, spot.heroCards) : -1;
  if (!node || handIdx < 0) {
    return (
      <Shell
        spot={spot}
        body={<Note>이 판은 다시 볼 수 없습니다.</Note>}
        onNext={onNext}
      />
    );
  }

  const labels = node.actions.map(actionLabel);
  const kinds = node.actions.map((a) => a.kind);
  const ev = actionEvFor(node, handIdx);

  // 답한 내용을 남겨야 고친 스팟이 목록에서 내려간다.
  const answer = (i: number) => {
    setPicked(i);
    const d = makeDecision(STREET_KO[spot.street] ?? spot.street, labels, ev, i, kinds, spot.board);
    const userId = currentUserId();
    if (!userId) return;
    void ensureGuestUser(userId).then(() =>
      logReview({
        userId,
        tableSize: DATA.tableSize,
        stackBb: DATA.stackBb,
        anteBb: DATA.anteBb,
        position: spot.seat,
        handCode: spot.handCode,
        street: spot.street,
        userAction: d.chosenKind,
        correctAction: d.bestKind,
        evLossBb: d.lossBb,
        nodeLine: spot.line,
        board: spot.board,
        heroCards: spot.heroCards,
        spotFile: spot.spotFile,
        heroPlayer: spot.heroPlayer,
      }),
    );
  };
  const decision =
    picked === null
      ? null
      : makeDecision(
          STREET_KO[spot.street] ?? spot.street,
          labels,
          ev,
          picked,
          kinds,
          spot.board,
        );

  const grid = fromNode(
    node,
    loaded.spot.handsByPlayer[node.player],
    labels,
    node.player === spot.heroPlayer ? spot.heroCards : null,
  );

  return (
    <Shell
      spot={spot}
      body={
        picked === null ? (
          <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: cols(labels.length) }}>
            {labels.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => answer(i)}
                className={`rounded-[var(--gw-radius-control)] py-3.5 text-[13px] font-bold transition active:scale-95 ${buttonClass(kinds[i])}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          decision && (
            <div className="mt-4">
              <div className="flex items-center gap-2">
                {decision.grade ? (
                  <>
                    <GradeIcon
                      id={decision.grade.id}
                      color={decision.grade.color}
                      className="h-6 w-6"
                    />
                    <span
                      className="text-[20px] font-bold leading-none"
                      style={{ color: decision.grade.color }}
                    >
                      {decision.grade.label}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-[var(--gw-text-muted)]">채점 불가</span>
                )}
                <span className="gw-num ml-auto text-[11px] text-[var(--gw-text-muted)]">
                  지난번 {ACTION_KO[spot.lastAction] ?? spot.lastAction} ·{" "}
                  {formatEvLoss(spot.lastLossBb)}
                </span>
              </div>

              <div className="mt-3">
                <DecisionRows rows={decision.rows} chosen={decision.chosen} />
              </div>

              <div className="mt-4">
                <RangeGrid view={grid} />
              </div>
            </div>
          )
        )
      }
      onNext={picked === null ? undefined : onNext}
    />
  );
}

function cols(n: number): string {
  return `repeat(${Math.min(n, 3)}, minmax(0, 1fr))`;
}

function buttonClass(kind: string): string {
  if (kind === "fold") return "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]";
  if (kind === "check" || kind === "call") return "bg-[var(--gw-accent)] text-[var(--gw-ink)]";
  return "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]";
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[13px] text-[var(--gw-text-muted)]">{children}</p>;
}

/** 보드와 내 두 장은 어느 상태에서도 보여야 한다. 그게 문제 자체이기 때문이다. */
function Shell({
  spot,
  body,
  onNext,
}: {
  spot: PostflopReviewSpot;
  body: React.ReactNode;
  onNext?: () => void;
}) {
  const hero = [spot.heroCards.slice(0, 2), spot.heroCards.slice(2, 4)];
  return (
    <>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="gw-num text-[30px] font-bold leading-none text-[var(--gw-text-primary)]">
          {spot.handCode}
        </span>
        <span className="gw-num text-[15px] font-semibold text-[var(--gw-accent)]">
          {spot.seat}
        </span>
        <span className="gw-label ml-auto">{STREET_KO[spot.street] ?? spot.street}</span>
      </div>

      <div className="mt-3 flex items-end gap-4">
        <div className="flex gap-1">
          {spot.board.map((c) => (
            <Card key={c} rank={c[0]} suit={c[1] as Suit} className="h-[52px] w-[38px]" />
          ))}
        </div>
        <div className="flex gap-1">
          {hero.map((c) => (
            <Card key={c} rank={c[0]} suit={c[1] as Suit} className="h-[44px] w-[32px]" />
          ))}
        </div>
      </div>

      {body}

      {onNext && (
        <button
          type="button"
          onClick={onNext}
          className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[14px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
        >
          다음 스팟
        </button>
      )}
    </>
  );
}
