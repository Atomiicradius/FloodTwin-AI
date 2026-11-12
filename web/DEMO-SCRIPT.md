# FloodTwin-AI: Demo Script

**Length:** about 8–10 minutes, plus questions.
**Style:** plain words. Say it like you are explaining to a friend. The lines in *italics* are what to say. The rest are notes for you.

---

## 0. Before you start (2 minutes of prep)

- Open the app and make the browser full screen (F11). Best size is 1920×1080.
- Close other tabs and apps. If the laptop is weak or the projector is slow, open the page with `?lite` at the end of the address. It looks almost the same and runs much faster.
- Run the page once from top to bottom before the real demo. The first scroll is the smoothest after everything has loaded.
- Do not touch anything on the first screen for a few seconds. The drains draw themselves in.

**Keys that help**

| Key | What it does |
|---|---|
| Right arrow / Left arrow | Go to the next / previous section |
| 1 to 7 | Jump straight to a section (0 = the start) |
| P | Presenter mode: shows a short note at the bottom left for each section |
| Scroll | Normal reading. The 3D scene on the left follows you |

**Two things to say in the first 30 seconds (important)**

1. *"Everything you will see is synthetic. We made up a catchment, three storms and the flood reports. The yellow bar at the top says so. We built this prototype to show the workflow and the interface, not to claim a real result."*
2. *"The real data work comes next. Today is about showing how the idea will work."*

Saying this first protects you. It also matches the rules of our project: we never present made-up data as real.

---

## The idea in one breath (use this if you get lost)

> *"When a street floods in a city, the cause is often hidden in the drains underneath. But the drain maps we have are incomplete and not always right. So we do four things: we check the map against other evidence, we simulate a storm on it, we ask 'what if we fixed this?', and we show how sure we are. And we ask whether AI can make those 'what ifs' faster."*

---

## 1. The start screen (hero), about 30 seconds

**On screen:** the title **FloodTwin-AI**, the line *"Drainage maps are incomplete. Floods don't wait."*, rain falling on the right, and a small drain network drawing itself in. One pipe stays dashed.

**What to say**

*"This is FloodTwin-AI. The idea is simple. Drainage maps are incomplete, but floods do not wait for us to fix the maps."*

*"See the dashed pipe in the drawing? That is our idea of an incomplete map. Most of the network is drawn, but we are not sure about some parts."*

*"One note on the name: this is a flood simulation and decision-support tool. It is not a live digital twin. A true digital twin would update itself from live sensors, and ours does not."*

**What the visuals mean:** the rain and ripples are just atmosphere. The glowing lines are the drainage pipes. Nothing here is a result yet.

Press the **right arrow** or scroll to continue.

---

## 2. Event & location, about 1 minute

**On screen:** three buttons **SYN-1, SYN-2, SYN-3**, a big number (**92 mm**), a bar chart of rain, and a list of flood reports. The 3D scene moves down toward a small rain gauge marker.

**What "SYN" means:** SYN is short for *synthetic*. These are three made-up storms. They are not real dates.

| Storm | Total rain | Role | In simple words |
|---|---|---|---|
| **SYN-1** | 92 mm | Calibration | A short, strong burst. |
| **SYN-2** | 129 mm | Calibration | A long, moderate storm. |
| **SYN-3** | 79 mm | **Held out** | A short, sharp storm. We keep this one hidden when tuning the model. |

**What to say**

*"We start with a storm. SYN-1, 2 and 3 are three made-up storms. The big number is the total rain at our rain gauge, which is the small marker in the 3D scene. The bars show how hard it rained over four hours."*

*"Two of the storms are for calibration. That means we are allowed to use them to tune the model. The third, SYN-3, is held out. We never tune on it. We use it later as a fair test. It is like keeping an exam paper secret until exam day."*

*"The list below shows flood reports, like citizen complaints. SYN-1 has three. They show where people said water collected."*

**Click "Storm and catchment detail"** (it opens a small panel). Point out: the peak rain rate (70 mm/h for SYN-1), 4 hours, about 5.3 km of mapped drains, 25 pipe segments and 26 junctions.

**Good to say:** *"A report means 'someone saw water here'. No report does not mean 'no flooding'. People just may not have reported it."*

**Try this live:** click SYN-2, then SYN-3. The big number and the chart change. The whole page updates for the new storm.

---

## 3. Infrastructure evidence, about 1.5 minutes

**On screen:** a big **4 of 25**, a coloured bar, a grid of buttons S01 to S25, and a card for one pipe. In the 3D scene the pipes are now **coloured**.

**What the colours mean**

| Colour | Name | In simple words | Count |
|---|---|---|---|
| Purple | Observed / verified | Someone checked it in the field | 2 |
| Green | Supported | Several independent sources agree with the map | 13 |
| Amber (dashed) | Disputed | The evidence disagrees with the map | 4 |
| Grey | Unverified | Not enough evidence either way | 6 |

**What to say**

*"The official map is just a claim. We do not trust it blindly. We ask: do other sources agree with it? We look at the terrain, satellite images, past flooding, and whether the pipe connects properly."*

*"Out of 25 pipe segments, 4 are disputed. That means some evidence disagrees with the map. Look at the amber dashed pipes in the 3D scene."*

*"Important: we give a status, not a percentage. We do not say '64% sure'. We have not calibrated that kind of number, so inventing one would be dishonest."*

**Click S06** (it is selected by default). The card says **"1 agree, 3 disagree"**:

- Terrain says the flow path is different from the mapped pipe (worth checking).
- Satellite imagery cannot see the pipe (it may be covered).
- Past flooding suggests the pipe is restricted.
- Connectivity looks fine. This is the one thing that agrees.

*"For S06, one source agrees and three disagree. That does not prove the pipe is blocked. It only says: this is the pipe to investigate first."*

**The yellow warning box matters. Read it out:** *"The terrain data is coarse. It cannot see individual roadside drains. A mismatch means 'worth looking at', never 'the drain is missing or blocked'."*

**Open "Hydraulic parameters".** Say: *"We do not know the exact pipe size or blockage. So we use ranges, and each one is tagged 'assumed' or 'sourced'. Nothing is passed off as a measured fact."*

**Try this live:** click S13, S18 or S22 (the other disputed pipes) and a purple one like S15 (a field check found it partly silted).

---

## 4. Baseline simulation, about 1.5 minutes

**On screen:** a 5-step bar (Rainfall → Runoff → Drainage model → Surface spreading → Compare), a big **14.0k m³**, a list of flooded junctions, a graph, and a table comparing storms. In the 3D scene, **blue water pools** appear at flooded places.

**What to say**

*"Now we run the storm through the drainage model. Rain falls, becomes runoff, flows into the pipes, and where a pipe cannot carry it, the water comes out at a junction. That is flooding."*

*"The big number, 14,000 cubic metres, is the total water that comes out of the drains in SYN-1."*

*"Look at the blue pools. The biggest one is at junction J06, about 9,400 cubic metres. That junction sits just upstream of our suspicious pipe, S06."*

**Click "J06" and read the graph.** The blue line is the water arriving. The yellow dashed line is the most the pipe can carry (12.8 m³/s). The red part is the extra, which has nowhere to go, so it floods.

*"Where the blue goes above the yellow line, the pipe is too small for that moment. The red area is the flood."*

**Say this clearly (a key point of our project):**
*"The drainage model only tells us how much water comes out at each junction. That is not a flood map. So we add a second step that spreads the water over the ground. We call it surface spreading. This is why you see 'Surface spreading' as its own step."*

**Click "Area and depth" (optional):** about 6.6 hectares flooded, deepest about 0.47 m, and 100% of the water is conserved. That means no water is lost or invented in the spreading step.

**The comparison table**

| Storm | Reports reproduced | Meaning |
|---|---|---|
| SYN-1 | 2 of 3 | Model flooded 2 of the 3 reported places |
| SYN-2 | 4 of 5 | Good match |
| SYN-3 (held out) | 4 of 7 | Weaker. This is the fair test |

*"The model does not match perfectly, and that is realistic. SYN-3 is the one we never tuned on, so it is the honest test. It is a bit weaker, and we say so."*

**Read the caveat out loud:** *"We compare at about 120 m resolution. A flooded place with no report is not proof of no flooding."*

---

## 5. Counterfactual ("what if we fix it?"), about 1.5 minutes

**On screen:** three sliders, a large **−9,394 m³** with **−67 %**, two bars (baseline in red, counterfactual in green). In the 3D scene the J06 pool has shrunk, and a **dashed coral circle** shows how big it used to be.

**What "counterfactual" means:** *"A 'what if' test. We change one thing, run the model again, and see what changes."*

**What to say**

*"Here we ask: what if S06 worked at its full mapped capacity? The model re-runs instantly. The flooding drops by 9,394 cubic metres, which is 67%. The coral dashed circle shows where the flood used to be."*

**Do it live (this is the best moment of the demo):**

1. Press **Reset**. The change goes to zero.
2. Drag **"Restore S06 to mapped capacity"** slowly to 100%. The pool shrinks and the green bar drops.
3. Click **"Both"** (restore capacity + clear blockage). The number becomes about **−11,988 m³ (−85%)**.
4. Move **"Event rainfall scale"** down to 60%. Less rain means less flood.

**What to say about the result:** *"This tells us the pipe S06 matters a lot, at least inside our model. It is a simulated effect, not a measured one."*

**Open "Area, depth and by-site detail".** Say: *"We also check that fixing one place does not make another place worse. Water can just move downstream. If that happened, you would see a red warning here."*

**Close with the key rule:** *"Final 'what if' answers must always come from the physical model, never from an AI shortcut. We will come back to that."*

---

## 6. Interactions, about 1 minute

**On screen:** a big **52 %**, bars, and a yellow box saying **"The factors interact."**

**What it shows:** we tested three fixes alone and together:

| Fix | Flooding removed alone |
|---|---|
| Restore pipe capacity (S06) | 9,394 m³ |
| Clear blockages (disputed pipes) | 11,988 m³ |
| Reduce rainfall by 10% | 6,368 m³ |
| **Added together** | **27,749 m³** |
| **All three at once** | **13,251 m³** |

**What to say**

*"If the fixes worked separately, doing all three would remove 27,749 cubic metres. But when we actually do all three together, we only remove 13,251. The difference is about half."*

*"Why? Because the fixes overlap. Each one alone already removes most of the flood at that spot, so adding more does not add as much. We call this an interaction."*

*"So we do not say 'the root cause is X'. The causes are tangled together. Naming a single cause would be misleading."*

**The coloured bar (Shapley values):** *"This is a fair way to share the credit between the three fixes: capacity 31%, blockage 45%, rainfall 24%. It describes how they contribute in this model. It is not proof of cause."*

**Optional:** open **"Show the eight runs"**. *"With three factors there are exactly 8 combinations, so we simply ran all of them."*

---

## 7. Uncertainty, about 1 minute

**On screen:** a big **82 %**, a small chart (tabs: Distribution / Through the event / Parameters), and in the 3D scene **soft coral and green glows** around the junctions.

**What to say**

*"So far we used one best guess for every pipe. But we do not know the real pipe sizes or blockages. So we ran 300 different 'plausible worlds', each with slightly different values inside the ranges we trust."*

*"In 82% of those 300 worlds, fixing S06 reduces the flooding. The typical reduction is about 17,000 cubic metres."*

**Say the honest part:** *"Notice it is not 100%. In about one world in five, the fix does not help. We show that instead of hiding it."*

**What the 3D glows mean:** coral glows show where the flood happens across the 300 worlds without the fix. Green glows show the same with the fix. A bigger, brighter glow means that place floods in more of the worlds.

**The three tabs**

- **Distribution:** red bars = flooding without the fix. Green bars = with the fix. The green group sits lower.
- **Through the event:** how the flooding at J06 builds up during the storm, with a band showing the spread.
- **Parameters:** which settings matter most. The pipe S06's size and blockage matter a lot ("strong"). Node storage barely matters ("weak"). *"This tells us what we must measure carefully in the real project."*

**Read the yellow box:** *"This is a scenario envelope, not a guarantee. It is the spread of the worlds we tried. It is not a promise that real life stays inside it."*

---

## 8. AI scalability, about 1 minute

**Say this first, before anything else:** *"Everything on this page is placeholder numbers. We have not trained any AI yet. This page shows the shape of the test we will do."* (There is an amber banner that says the same.)

**On screen:** a big **≈ 2,246 scenarios**, a chart with a red line and a blue line crossing, and three sliders.

**What it is:** a GNN is a type of AI that works on networks, like our drain network. The question is: *can a trained AI answer "what if?" questions much faster than the full simulation?*

**What to say**

*"Running the full simulation once takes a few seconds. For one catchment that is fine. But if we want to test thousands of ideas, it adds up."*

*"An AI model needs a lot of upfront work: we must run the simulation thousands of times to teach it, then train it. After that, each answer takes milliseconds."*

*"The chart shows both costs. The red line is running the simulation every time. The blue line is the AI, which costs a lot at the start and very little per answer. They cross at about 2,246 scenarios. Below that, just use the simulation. Above that, the AI starts to save time."*

**Try this live:** drag "Direct run time" up (a bigger network takes longer to simulate). The crossing point moves left, because the AI becomes worth it sooner.

**Read the closing note:** *"The AI only screens ideas. The physical model decides. A faster model with big errors is useless, so we always report the error next to the speed."*

---

## 9. The closing line, about 20 seconds

**On screen:** "Synthetic today. Real data next."

*"To sum up: we check the drain map, simulate a storm, test what-if fixes, show how sure we are, and ask whether AI can speed up the what-ifs. Today everything was synthetic. Next, we pick a real catchment based on what data we can actually get, and replace each synthetic piece with the real one."*

---

## What each synthetic part will become (good for questions)

| In the prototype | In the real project |
|---|---|
| Made-up terrain | A real elevation map (DEM) |
| Made-up drain map and evidence | Real public drain data, checked with satellite, field and complaint data |
| Our simple routing model ("SWMM-lite") | EPA SWMM, the standard drainage model |
| Simple surface spreading | A proper surface-water step (and maybe a 2D model later) |
| Made-up storms and reports | Real rain gauge records and real flood reports |
| Placeholder AI timings | A real trained GNN with measured speed and error |

---

## Likely questions and short answers

**"Is this real data?"**
*"No. It is all synthetic, and the banner says so. We built it to show the workflow before we collect real data."*

**"Then what is actually working?"**
*"The logic and the interface. The model runs and responds live. The sliders, the 300-world test and the interaction test are real calculations. They are run on made-up inputs."*

**"Is that EPA SWMM?"**
*"No. It is a simplified stand-in we wrote for the demo. The real project will use EPA SWMM."*

**"Why is there no percentage like '70% sure this drain is blocked'?"**
*"We have no data to calibrate a percentage. A made-up percentage would look scientific but mean nothing. So we use status labels instead."*

**"Why can't the terrain map tell you if a drain is blocked?"**
*"The elevation map is too coarse. It can see the lay of the land, not a single roadside drain. A mismatch is only a reason to look closer."*

**"What is 'held out'?"**
*"A storm we never use for tuning. We keep it for a fair final test, like a surprise exam."*

**"Why 300 scenarios? Why not one answer?"**
*"We do not know exact pipe sizes or blockages. One answer would pretend we do. Many scenarios show how robust the conclusion is."*

**"Is the 82% a probability that it will work in real life?"**
*"No. It is the share of our 300 made-up scenarios where the fix helped. It is about our model, not a promise about reality."*

**"Why do you need AI at all?"**
*"One simulation is fast enough. AI only matters when we test thousands of ideas. That is exactly why we measure the break-even point, and we will drop the AI if it does not earn its place."*

**"Is this a digital twin?"**
*"No. A digital twin updates itself from live data. This is a simulation and decision-support tool."*

**"Is the idea new?"**
*"We have not done the literature search yet, so we do not claim novelty. We will do that before we claim anything."*

---

## Things NOT to say

- "This predicts floods in Bengaluru." (It is a synthetic catchment.)
- "The terrain proves the drain is missing or blocked."
- "The model is 82% accurate." (82% is the share of scenarios where the fix helped.)
- "The AI results show..." (Nothing was trained yet.)
- "This is a digital twin."
- "This is new / state of the art."

---

## One-page cheat sheet (keep this on a second screen)

| # | Section | One-sentence message | Key number |
|---|---|---|---|
| 0 | Start | Drain maps are incomplete; floods don't wait. | the dashed pipe |
| 1 | Event & location | Three made-up storms; SYN-3 is the secret test. | 92 mm (SYN-1) |
| 2 | Evidence | Don't trust the map blindly; 4 pipes disagree with the evidence. | 4 of 25 |
| 3 | Baseline | Simulate the storm, then spread the water on the ground. | 14.0k m³ at the drains |
| 4 | Counterfactual | Fix the suspicious pipe and flooding drops. | −9,394 m³ (−67%) |
| 5 | Interactions | Fixes overlap, so there is no single root cause. | 52% |
| 6 | Uncertainty | Across 300 plausible worlds, the fix usually helps. | 82% |
| 7 | AI | AI only pays off after a break-even point. Placeholders only. | ≈ 2,246 scenarios |
| End | Next | Synthetic today, real data next. | |

---

## Word list (plain meaning)

- **Catchment:** the area of land whose rainwater flows to the same place.
- **Drainage network:** all the pipes and channels under the streets.
- **Junction / node:** a point where pipes meet (like J06).
- **Segment:** one pipe between two junctions (like S06).
- **Calibration:** adjusting the model so it fits past storms.
- **Held-out:** a storm kept aside to test the model fairly.
- **Counterfactual:** a "what if" test where you change one thing.
- **Surface spreading:** turning "water leaving the pipe" into "water on the ground".
- **Scenario envelope:** the spread of results across the worlds we tried. It is not a guarantee.
- **Class B:** the label for synthetic experiments. It means "good for showing how it works, not for claiming real performance".
- **GNN:** an AI model designed to work on networks.
- **Break-even:** the number of "what ifs" after which the AI saves time overall.
