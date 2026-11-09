# Premium (custom) emoji of the @FlopClub22 channel

Source: public preview `https://t.me/s/FlopClub22` (158 posts, #318-#609 read on 2026-11-08); every custom emoji is a `<tg-emoji emoji-id="…">` there. Re-scrape instead of guessing when a new emoji appears. Bot messages take them as `custom_emoji` entities (UTF-16 offset/length of the fallback character); used in `apps/api/src/services/telegramRatingResults.ts` (`PREMIUM_EMOJI_IDS`). Not verified that Telegram accepts these entities from this bot.

## Results post (same in every tournament)

| Role | Fallback | id |
| --- | --- | --- |
| Top banner, five in a row (1st = 5th) | 🌟 | 5395608259656709199, 5395543087822959661, 5395607374893448117, 5395790774291954136, 5395608259656709199 |
| Place 1 / 2 / 3 | 👑 | 5260367375957516164 / 5260409118744665341 / 5260512090585588535 |
| Rating points for place (Bounty, Mystery) | ⚡️ | 5456140674028019486 (Devil Deal uses 5400363978159323684) |
| Bounty points | 🥊 | 5231406626228948265 |
| "Next tournament" date / start / places left | 🃏 / ⏰️ / ⚠️ | 5298499667569425533 / 5983287256083862087 / 5415588310078735452 |
| Sign-off | ❤️ 🐍 | 5197350907120995186, 5197646705813634076 |

## Tournament title emoji (before and after the name)

| Tournament | Fallback | id |
| --- | --- | --- |
| Flop Bounty | 🥥 | 5429249222362810005 |
| Flop Mystery Knockout | 🎁 | 5391209710634433397 |
| Flop Booster Re-entry | ⬇️ (older posts 📈 5244837092042750681, as "next" 🚀 5188481279963715781) | 5408912908698548661 |
| Flop Bomb Pot | ♠️ (as "next" 🤯 5389025045454556383) | 5264808337781829580 |
| Flop Rampage | 💀 | 5463250708918711044 |
| Flop Butterfly | 🦋 | 5296491512660534111 |
| Flop Devil Deal | 🐈‍⬛ | 5413679274425087559 |
| Flop Phoenix | 🐦‍🔥 (results post 🕊️ 5323549454438010650) | 5397922830417415334 |
| Flop Chip Leader | 🏆 | 5226431245918942763 |
| Flop Freeze Out | ❄️ | 5431895003821513760 |

In the results post the title emoji come from `TITLE_EMOJI` in `telegramRatingResults.ts`: Bounty 🥥, Deep Stack ♠️ 5264808337781829580, Booster 📈 5244837092042750681, Mystery 🎁, Butterfly 🦋, Black Edition 🆓 5406756500108501710, Phoenix 🕊️, Bomb Pot 💣 5226813248900187912; any other tournament keeps 🥥. Only the first and last emoji of the title line are premium, so a player named with ♠️ is not touched.

## Announcement posts

📍 5391032818111363540 (address), 📌 5400111356772905255, 📣 5399907745258306570, 🎁 6032854597473668490 / 5391209710634433397, 🔥 5397751602956239123 / 5256047523620995497, 🗓️ 5472279086657199080, 💣 5226813248900187912, ⚠️ 5415588310078735452 / 5447644880824181073, ❗️ 5400262672765711578, 🔴 5398065874303220590, 🥳 5391211840938209909, 🏆 5188344996356448758, 🚗 5417922500250062658, 🔋 5454125707300978880, ⚔️ 5454014806950429357.

## Traps

- One visible emoji can have several ids (👑 has three, 🌟 many); take the id the channel uses for that role, not any id with the same fallback.
- Fallbacks with variation selectors differ in length (`⚡️` is 2 UTF-16 units, `🐦‍🔥` is 5); measure the exact string in the text.
- The admin copy button "Текст итогов для канала" returns plain text; premium emoji only go out through the bot.
