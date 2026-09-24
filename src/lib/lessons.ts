// 치는 것 말고 읽는 것.
//
// 트레이너는 "이 상황에서 뭐가 맞나"를 알려주지만 "왜"는 알려주지 않는다.
// EV 숫자만 보고 외우면 조건이 조금만 달라져도 무너진다. 그래서 읽을거리를
// 따로 둔다.
//
// 여기 들어갈 글의 조건: 우리가 실제로 계산해서 아는 것만 쓴다. 일반론은
// 인터넷에 이미 많고, 이 앱이 보태는 값은 "이 게임 조건에서 실제로 이렇더라"다.

export type LessonStatus = "ready" | "draft";

export type LessonBlock =
  | { kind: "text"; body: string }
  | { kind: "note"; body: string }
  /** 계산으로 나온 수치. 본문과 구분해 보여줘야 근거가 산문에 묻히지 않는다. */
  | { kind: "figures"; caption: string; rows: { label: string; value: string }[] };

export type Lesson = {
  id: string;
  title: string;
  /** 목록에서 한 줄로 보이는 요약. */
  summary: string;
  minutes: number;
  tags: string[];
  status: LessonStatus;
  blocks: LessonBlock[];
};

export const LESSONS: Lesson[] = [
  {
    id: "bb-ante-defence",
    title: "BB 앤티가 있으면 왜 더 넓게 지키나",
    summary: "앤티 1bb가 들어가는 순간 BB의 폴드 기준이 통째로 바뀝니다.",
    minutes: 3,
    tags: ["프리플랍", "BB", "앤티"],
    status: "ready",
    blocks: [
      {
        kind: "text",
        body:
          "홀덤펍에서 흔한 BB 앤티 구조에서는 빅블라인드가 블라인드 1bb와 앤티 1bb를 " +
          "함께 냅니다. 이 2bb는 액션과 무관하게 이미 나간 돈입니다.",
      },
      {
        kind: "text",
        body:
          "그래서 BTN이 2.5bb로 열었을 때 BB가 마주하는 계산은 \"2.5bb를 내고 따라갈까\"가 " +
          "아닙니다. 이미 1bb를 냈으니 1.5bb만 더 내면 되고, 그 1.5bb로 노리는 팟에는 " +
          "상대의 2.5bb, SB의 0.5bb, 그리고 자기 앤티까지 들어 있습니다.",
      },
      {
        kind: "figures",
        caption: "20bb 스택, BB 앤티 1bb, BTN 2.5bb 오픈 기준",
        rows: [
          { label: "BB가 더 내야 하는 금액", value: "1.5bb" },
          { label: "그때 팟에 있는 금액", value: "5.0bb" },
          { label: "필요한 승률", value: "23%" },
          { label: "앤티가 없다면 필요 승률", value: "27%" },
        ],
      },
      {
        kind: "text",
        body:
          "필요 승률이 낮아지면 지킬 수 있는 핸드가 늘어납니다. 앤티가 없는 게임의 " +
          "감각으로 접으면, 접을 때마다 이미 낸 2bb를 그냥 버리는 셈이 됩니다.",
      },
      {
        kind: "note",
        body:
          "반대로 BTN 입장에서는 가져갈 죽은 돈이 많아지므로 오픈 레인지가 넓어집니다. " +
          "같은 앤티가 양쪽을 다 넓히는 것이고, 그래서 이 구조에서는 판이 커집니다.",
      },
    ],
  },
  {
    id: "ev-loss-reading",
    title: "EV 손실을 읽는 법",
    summary: "정답·오답이 아니라 얼마나 손해였는지로 봅니다.",
    minutes: 2,
    tags: ["기초", "채점"],
    status: "ready",
    blocks: [
      {
        kind: "text",
        body:
          "이 앱은 선택을 맞았다/틀렸다로 나누지 않습니다. 고른 액션이 최선보다 " +
          "몇 bb 손해였는지를 보여줍니다. 포커에는 아깝게 두 번째인 선택과 " +
          "치명적인 선택이 있고, 둘을 같은 오답으로 묶으면 배울 것이 사라집니다.",
      },
      {
        kind: "figures",
        caption: "손실 구간과 등급",
        rows: [
          { label: "0.01bb 이하", value: "최선 — 솔버 자체 오차 범위" },
          { label: "0.05bb 이하", value: "무난" },
          { label: "0.25bb 이하", value: "부정확" },
          { label: "1.0bb 이하", value: "실수" },
          { label: "1.0bb 초과", value: "큰 실수" },
        ],
      },
      {
        kind: "note",
        body:
          "최선 구간이 0.01bb인 데는 이유가 있습니다. 솔버가 완전한 균형까지 " +
          "가지 않고 멈추기 때문에 그보다 작은 차이는 계산 오차와 구분되지 않습니다. " +
          "0.00과 0.005의 차이를 두고 고민할 필요가 없다는 뜻입니다.",
      },
    ],
  },
  {
    id: "spr-and-sizing",
    title: "스택이 얕으면 벳 사이즈가 달라진다",
    summary: "SPR이 2.5일 때와 3.6일 때는 다른 게임입니다.",
    minutes: 3,
    tags: ["포스트플랍", "SPR"],
    status: "draft",
    blocks: [],
  },
];

export function findLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
