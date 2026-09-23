// 포스트플랍 스팟 하나를 풀어 트레이너가 읽는 JSON으로 내보낸다.
//
// 전체 트리는 20bb에서도 839MB다 — 턴·리버 런아웃 49×48가지를 전부 담기 때문이다.
// 그런데 한 판을 치는 데 쓰이는 건 런아웃 하나뿐이고, 보드를 우리가 깔므로 어떤
// 런아웃을 낼지도 우리가 정한다. 지정한 런아웃 하나만 따라가며 뽑으면 1MB 아래로 떨어진다.
//
// 출력 형식은 src/lib/tree.ts의 SolvedSpot과 같아야 한다.
//
// 실행: cargo run --release -- --flop Td9d6h --turn 2c --river 7s --out spot.json

use postflop_solver::*;
use serde_json::{json, Value};

/// 칩 단위를 bb로. 솔버는 정수 칩을 쓰고 우리는 0.1bb를 1칩으로 둔다.
fn bb(chips: i32) -> f64 {
    (chips as f64 / 10.0 * 100.0).round() / 100.0
}

/// 솔버의 EV는 칩 단위다. bb로 바꾸고 0.01bb까지 남긴다 — 채점 최상위 밴드가
/// 0.01bb라 그보다 거칠면 등급이 갈리지 않는다.
///
/// bb(x)는 정수 칩을 받는 함수라 실수 EV에 쓸 수 없다. bb((v*10).round())는
/// x/10에 10을 도로 곱하는 꼴이라 변환이 일어나지 않고 칩 값이 그대로 나간다.
fn ev_bb(chips: f32) -> f64 {
    (chips as f64 / 10.0 * 100.0).round() / 100.0
}

fn round3(v: f32) -> f64 {
    (v as f64 * 1000.0).round() / 1000.0
}

/// 빈도는 1% 해상도면 충분하다. 소수 3자리로 두면 파일이 20% 커지기만 한다.
fn round2(v: f32) -> f64 {
    (v as f64 * 100.0).round() / 100.0
}

/// 액션을 트리 형식의 {kind, amountBb}로. 금액은 "이 액션으로 추가로 넣는 칩"이다.
///
/// Bet/Raise/AllIn의 인자는 그 스트릿 기준의 "얼마까지 올린다"는 값이다.
/// 따라서 빼야 하는 건 핸드 누적액이 아니라 이 스트릿에서 이미 낸 금액이다.
/// (누적액을 빼면 턴·리버에서 금액이 앞 스트릿만큼 작게 나온다.)
fn action_json(a: &Action, already_in: i32) -> Value {
    let (kind, amount) = match *a {
        Action::Fold => ("fold", 0),
        Action::Check => ("check", 0),
        Action::Call => ("call", 0), // 콜 금액은 노드 팟 차이로 드러나므로 0으로 둔다
        Action::Bet(to) => ("bet", to - already_in),
        Action::Raise(to) => ("raise", to - already_in),
        Action::AllIn(to) => ("allin", to - already_in),
        Action::Chance(_) => ("check", 0), // 찬스는 여기 오지 않는다
        Action::None => ("check", 0),
    };
    json!({ "kind": kind, "amountBb": bb(amount) })
}

fn action_key(a: &Value) -> String {
    let kind = a["kind"].as_str().unwrap();
    let amt = a["amountBb"].as_f64().unwrap();
    if amt > 0.0 {
        format!("{kind}{amt}")
    } else {
        kind.to_string()
    }
}

fn street_name(board_len: usize) -> &'static str {
    match board_len {
        3 => "flop",
        4 => "turn",
        _ => "river",
    }
}

/// 1차 솔브에서 각 노드의 전략을 걷어 온다. 내보낼 노드만 모으면 되므로
/// 트리 전체가 아니라 지정한 런아웃을 따라간 경로만 본다.
fn collect_locks(
    game: &mut PostFlopGame,
    runout: &[u8; 2],
    floor: f32,
    out: &mut Vec<(Vec<usize>, Vec<f32>)>,
) {
    if game.is_terminal_node() {
        return;
    }
    if game.is_chance_node() {
        let card = runout[game.current_board().len() - 3];
        if game.possible_cards() & (1u64 << card) == 0 {
            return;
        }
        let saved = game.history().to_vec();
        game.play(card as usize);
        collect_locks(game, runout, floor, out);
        game.apply_history(&saved);
        return;
    }

    // 바닥을 깐 전략. 빈도 0인 액션에도 최소 ε을 줘서 그 가지의 도달확률이
    // 0이 되지 않게 한다. 0이면 솔버가 그 핸드의 EV를 통째로 0으로 돌려준다.
    let strategy = game.strategy();
    let floored: Vec<f32> = strategy.iter().map(|v| v.max(floor)).collect();
    out.push((game.history().to_vec(), floored));

    let n = game.available_actions().len();
    let saved = game.history().to_vec();
    for i in 0..n {
        game.play(i);
        collect_locks(game, runout, floor, out);
        game.apply_history(&saved);
    }
}

struct Exporter {
    nodes: Vec<Value>,
    runout: [u8; 2],
    starting_pot: i32,
}

impl Exporter {
    /// 현재 노드를 기록하고 모든 액션 분기로 내려간다.
    /// 찬스 노드에서는 지정된 런아웃 카드로만 내려간다.
    fn walk(&mut self, game: &mut PostFlopGame, line: &str, street_base: i32) {
        if game.is_terminal_node() {
            return;
        }

        if game.is_chance_node() {
            let board_len = game.current_board().len();
            let card = self.runout[board_len - 3];
            if game.possible_cards() & (1u64 << card) == 0 {
                return; // 보드와 겹치는 런아웃이면 그 가지는 버린다
            }
            let saved = game.history().to_vec();
            game.play(card as usize);
            // 스트릿이 바뀌었다. 이 시점의 누적 베팅액이 새 스트릿의 기준선이고,
            // 양쪽이 같은 금액을 낸 상태이므로 한쪽만 읽으면 된다.
            let base = game.total_bet_amount()[0];
            self.walk(game, line, base);
            game.apply_history(&saved);
            return;
        }

        let player = game.current_player();
        let bets = game.total_bet_amount();
        let pot = self.starting_pot + bets[0] + bets[1];

        let actions: Vec<Value> = game
            .available_actions()
            .iter()
            .map(|a| action_json(a, bets[player] - street_base))
            .collect();

        game.cache_normalized_weights();
        let strategy = game.strategy();
        let action_ev = game.expected_values_detail(player);
        let hand_count = game.private_cards(player).len();

        self.nodes.push(json!({
            "line": line,
            "street": street_name(game.current_board().len()),
            "player": player,
            "potBb": bb(pot),
            "handCount": hand_count,
            "actions": actions,
            "strategy": strategy.iter().map(|v| round2(*v)).collect::<Vec<_>>(),
            "actionEv": action_ev.iter().map(|v| ev_bb(*v)).collect::<Vec<_>>(),
        }));

        let saved = game.history().to_vec();
        for (i, a) in actions.iter().enumerate() {
            let next = if line.is_empty() {
                action_key(a)
            } else {
                format!("{line}/{}", action_key(a))
            };
            game.play(i);
            self.walk(game, &next, street_base);
            game.apply_history(&saved);
        }
    }
}

fn arg(name: &str, default: &str) -> String {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| default.to_string())
}

fn main() {
    let flop_str = arg("--flop", "Td9d6h");
    // 런아웃은 "턴+리버"를 붙여 쓰고 쉼표로 여러 개를 준다. 예: "2c7s,Kd4h"
    // 비싼 건 솔브뿐이고 런아웃을 따라가며 뽑는 일은 싸다. 한 번 풀어 여러 개를
    // 내보내면 보드를 늘리는 비용이 런아웃 수만큼 나눠진다.
    let runouts_str = arg("--runouts", &format!("{}{}", arg("--turn", "2c"), arg("--river", "7s")));
    let outdir = arg("--outdir", ".");
    let tag = arg("--tag", "spot");
    let stack: i32 = arg("--stack", "200").parse().expect("--stack은 정수 칩");
    let pot: i32 = arg("--pot", "55").parse().expect("--pot은 정수 칩");
    // 프리플랍용 EV 표본을 뽑을 때 쓴다. 트리를 안 내보내므로 파일이 수십 KB로
    // 떨어지고, 런아웃도 필요 없다 — 루트 EV는 모든 런아웃을 포함한 값이라
    // 런아웃을 무엇으로 잡든 똑같이 나온다.
    let ev_only = std::env::args().any(|a| a == "--ev-only");
    // 전략에 깔 최소 빈도. 0이면 안 깐다(프리플랍용 EV 표본은 루트만 쓰므로 불필요).
    let floor: f32 = arg("--floor", "0").parse().expect("--floor는 실수");
    let target_pct: f32 = arg("--target-pct", "0.5").parse().expect("--target-pct는 실수");

    let runouts: Vec<(String, String)> = runouts_str
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| {
            assert!(s.len() == 4, "런아웃은 턴+리버 4글자여야 한다: {s}");
            (s[0..2].to_string(), s[2..4].to_string())
        })
        .collect();

    // BTN 오픈에 BB가 디펜스한 상황의 레인지.
    //
    // 좁게 잡으면 안 된다. 프리플랍 솔브는 "콜하고 플랍을 본다"의 값을 이 레인지
    // 안에서만 얻을 수 있어서, 빠진 핸드는 콜이라는 선택지 자체를 잃고 폴드 아니면
    // 올인으로 몰린다. 실제로 좁은 레인지로 풀었을 때 BB가 콜 6% / 올인 45%라는
    // 엉뚱한 답이 나왔다. 조금 넓은 건 정확도가 약간 무뎌지는 정도지만, 빠진
    // 핸드는 답을 통째로 왜곡한다.
    let oop_range = arg(
        "--oop-range",
        "22+,A2s+,K2s+,Q2s+,J4s+,T5s+,95s+,84s+,74s+,63s+,53s+,42s+,32s,A2o+,K5o+,Q7o+,J8o+,T8o+,97o+,87o,76o",
    );
    let ip_range = arg(
        "--ip-range",
        "22+,A2s+,K2s+,Q2s+,J2s+,T4s+,95s+,84s+,74s+,63s+,53s+,42s+,32s,A2o+,K4o+,Q7o+,J8o+,T8o+,97o+,86o+,76o,65o",
    );

    let card_config = CardConfig {
        range: [oop_range.parse().unwrap(), ip_range.parse().unwrap()],
        flop: flop_from_str(&flop_str).unwrap(),
        turn: NOT_DEALT,
        river: NOT_DEALT,
    };

    let bet_sizes = BetSizeOptions::try_from(("50%, a", "2.5x")).unwrap();
    let tree_config = TreeConfig {
        initial_state: BoardState::Flop,
        starting_pot: pot,
        effective_stack: stack,
        rake_rate: 0.0,
        rake_cap: 0.0,
        flop_bet_sizes: [bet_sizes.clone(), bet_sizes.clone()],
        turn_bet_sizes: [bet_sizes.clone(), bet_sizes.clone()],
        river_bet_sizes: [bet_sizes.clone(), bet_sizes],
        turn_donk_sizes: None,
        river_donk_sizes: None,
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.15,
        merging_threshold: 0.1,
    };

    let build = || {
        let tree = ActionTree::new(tree_config.clone()).unwrap();
        PostFlopGame::with_config(card_config.clone(), tree).unwrap()
    };

    let target = pot as f32 * (target_pct / 100.0);
    let mut game = build();
    game.allocate_memory(false);
    let expl = solve(&mut game, 1000, target, false);
    eprintln!(
        "솔브 완료 · 착취가능성 {:.4} (팟의 {:.3}%)",
        expl,
        100.0 * expl / pot as f32
    );

    // 레인지를 벗어난 핸드도 채점하려면 모든 가지의 도달확률이 0이 아니어야 한다.
    // 1차 전략에 최소 빈도를 깔아 잠그고 한 번 더 푼다. 잠근 전략이 이미 균형에
    // 가까우므로 나머지도 거의 같은 답으로 수렴한다.
    if floor > 0.0 && !runouts.is_empty() {
        let first = [
            card_from_str(&runouts[0].0).unwrap(),
            card_from_str(&runouts[0].1).unwrap(),
        ];
        let mut locks = Vec::new();
        game.back_to_root();
        collect_locks(&mut game, &first, floor, &mut locks);

        let mut floored = build();
        floored.allocate_memory(false);
        for (history, strategy) in &locks {
            floored.apply_history(history);
            floored.lock_current_strategy(strategy);
        }
        floored.back_to_root();
        let expl2 = solve(&mut floored, 1000, target, false);
        eprintln!(
            "  바닥 {:.3} 적용 후 재솔브 · 잠근 노드 {}개 · 착취가능성 {:.4}",
            floor,
            locks.len(),
            expl2
        );
        game = floored;
    }

    game.back_to_root();
    let hands: Vec<Vec<String>> = (0..2)
        .map(|p| holes_to_strings(game.private_cards(p)).unwrap())
        .collect();

    // 레인지의 핸드별 비중. 이게 없으면 모든 조합을 같은 확률로 돌리게 되는데,
    // 실제 레인지는 핸드마다 비중이 달라서 딜링이 왜곡된다.
    let weights: Vec<Vec<f64>> = (0..2)
        .map(|p| game.weights(p).iter().map(|w| round3(*w)).collect())
        .collect();

    let flop_cards: Vec<String> = flop_str
        .as_bytes()
        .chunks(2)
        .map(|c| String::from_utf8_lossy(c).to_string())
        .collect();

    std::fs::create_dir_all(&outdir).unwrap();

    if ev_only {
        game.back_to_root();
        game.cache_normalized_weights();
        let root_ev: Vec<Vec<f64>> = (0..2)
            .map(|p| game.expected_values(p).iter().map(|v| ev_bb(*v)).collect())
            .collect();
        let out = json!({
            "flop": flop_cards,
            "startingPotBb": bb(pot),
            "effectiveStackBb": bb(stack),
            "handsByPlayer": hands,
            "handWeightsByPlayer": weights,
            "rootEvByPlayer": root_ev,
        });
        let name = format!("{tag}-{flop_str}.json");
        let path = format!("{outdir}/{name}");
        std::fs::write(&path, serde_json::to_string(&out).unwrap()).unwrap();
        println!("EV	{name}	{flop_str}	{expl:.4}");
        eprintln!(
            "  저장 {name} · {:.0}KB",
            std::fs::metadata(&path).unwrap().len() as f64 / 1024.0
        );
        return;
    }

    for (turn_str, river_str) in &runouts {
        game.back_to_root();
        let mut ex = Exporter {
            nodes: Vec::new(),
            runout: [
                card_from_str(turn_str).unwrap(),
                card_from_str(river_str).unwrap(),
            ],
            starting_pot: pot,
        };
        ex.walk(&mut game, "", 0);

        // 플랍 루트에서 양쪽의 핸드별 EV. 프리플랍 솔브에서 "콜하고 플랍을 본다"의
        // 가치가 바로 이 값이다. 노드별 actionEv는 그 시점에 액션하는 쪽만 담으므로
        // IP의 루트 EV는 여기서 따로 뽑아야 한다.
        game.back_to_root();
        game.cache_normalized_weights();
        let root_ev: Vec<Vec<f64>> = (0..2)
            .map(|p| {
                game.expected_values(p).iter().map(|v| ev_bb(*v)).collect()
            })
            .collect();

        let spot = json!({
            "flop": flop_cards,
            "runout": { "turn": turn_str, "river": river_str },
            "rootEvByPlayer": root_ev,
            "startingPotBb": bb(pot),
            "effectiveStackBb": bb(stack),
            "handsByPlayer": hands,
            "handWeightsByPlayer": weights,
            "nodes": ex.nodes,
        });

        let name = format!("{tag}-{flop_str}-{turn_str}{river_str}.json");
        let path = format!("{outdir}/{name}");
        std::fs::write(&path, serde_json::to_string(&spot).unwrap()).unwrap();
        let bytes = std::fs::metadata(&path).unwrap().len();
        // 이 줄을 생성 스크립트가 읽어 목록 파일을 만든다.
        println!(
            "SPOT\t{name}\t{flop_str}\t{turn_str}\t{river_str}\t{}\t{}\t{}",
            bb(pot),
            bb(stack),
            ex.nodes.len()
        );
        eprintln!(
            "  저장 {name} · 노드 {}개 · {:.2}MB",
            ex.nodes.len(),
            bytes as f64 / (1024.0 * 1024.0)
        );
    }
}
