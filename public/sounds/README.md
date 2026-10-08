# Sounds

The board plays a sound at key moments. Put an audio file here named after the sound (`.ogg`,
`.mp3`, `.wav`, `.m4a` or `.webm`), rebuild (`pnpm build`) and reload the extension: the board plays
that file. A sound without a file plays nothing from the board. Endstep's own page keeps running
under the board and plays its sounds (casting, lands, combat, damage, draws, winning and losing,
set in Endstep's audio settings), so with this folder empty those are what you hear. With a file
here, both play.

| File name | When it plays |
| --- | --- |
| `cast` | A spell goes on the stack |
| `resolve` | A spell resolves (lands on the battlefield or goes to the graveyard) |
| `land` | A land is played |
| `pass` | You pass priority |
| `attack` | Attackers are declared |
| `hit` | A combat strike lands |
| `zap` | A spell or ability's damage hits its target |
| `exile` | A permanent is exiled |
| `token` | A token comes in |
| `counter` | Power/toughness or counters go up |
| `turn` | Your turn starts |
| `win` | You win the game |
| `lose` | You lose the game |

For example `public/sounds/cast.ogg`. Volume and on/off are in the table menu → Arena UI settings.

## Arena's sounds

You can use MTG Arena's own sounds for yourself. Arena keeps them in Wwise sound banks inside its
install folder. A converter such as [vgmstream](https://vgmstream.org/) turns them into `.wav`
files; pick the ones you like and save them here under the names above.

They're Wizards of the Coast's, so they stay on your machine. Everything in this folder except
this README is git-ignored, and `pnpm run package` leaves the files out of the release zip.
