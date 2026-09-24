// 처음 들어온 사람에게 한 번 보여주는 안내.
//
// 이 앱은 QR을 찍고 들어온다. 포커는 치지만 솔버는 처음인 사람이 대부분이고,
// 그런 사람에게 "EV 손실 0.3bb"는 아무 뜻도 아니다. 뜻을 모르면 화면의 숫자가
// 그냥 점수로 읽히고, 점수로 읽히면 배우는 게 아니라 맞히기가 된다.
//
// 그래서 두 장, 한 줄씩만 보여준다. 치면서 알게 되는 것(판을 어떻게 치는지,
// 격자 읽는 법)은 뺐다. 길면 넘겨버리고, 넘겨버리면 없는 것과 같다.

const SEEN_KEY = "gto.onboarding.v1";

export type GuideCard = {
  title: string;
  /** 한 장에 문단 두 개까지. 그 이상은 읽지 않는다. */
  body: string[];
  /** 등급표를 함께 보여줄 장인가. */
  showGrades?: boolean;
};

export const GUIDE_CARDS: GuideCard[] = [
  {
    title: "판단마다 손해를 매깁니다",
    body: ["가장 좋은 선택과 비교해 잃은 만큼을 bb로 보여줍니다. 0에 가까울수록 잘 친 판단입니다."],
    showGrades: true,
  },
  {
    title: "틀린 자리는 다시 옵니다",
    body: ["크게 잃은 판단은 복습에서 다시 나옵니다."],
  },
];

/** 이 사람이 안내를 이미 봤는가. 서버에서는 알 수 없으므로 항상 봤다고 답한다. */
export function hasSeenGuide(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // 사파리 비공개 모드 등에서 저장소가 막힌다. 안내를 못 여는 것보다
    // 매번 보여주는 편이 낫지만, 매번 보여주면 성가시다 — 봤다고 친다.
    return true;
  }
}

export function markGuideSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // 저장이 막혔으면 다음에 또 보게 된다. 그뿐이다.
  }
}
