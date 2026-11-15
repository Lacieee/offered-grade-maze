# Offered Grade Maze – project plan

## The idea

A first-person browser game set in a house with non-Euclidean geometry. As in _Portal_, every door is a live window into the room it leads to, and stepping through is seamless. As in _Layers of Fear_, the house does not follow normal space: a room can be bigger than the space it should fit in, a door does not always lead back where you came from, and the same room can be reached through several doors. The player has to find the Offered Grade (_megajánlott jegy_) hidden in the house, as fast as possible.

Every house is generated from a short code (a seed): its rooms, door connections and furniture. The same seed always gives the same house, so houses can be shared and replayed.

## Roles

- **Player:** picks a difficulty or enters a seed, explores, finds the goal, sees the time.
- **Product owner:** decides the rules: difficulty levels, what makes a house valid.
- **Tester:** uses a debug view that shows the map of the house and the guaranteed route.
- **Server:** generates and validates houses, checks every move, stores results.

## Main scenarios

1. Play a new house on Easy, Medium or Hard, then see the time and the seed.
2. Replay a friend's house from their seed.
3. Open the debug view mid-game to see the map and the route; the clock keeps running.
4. The generator produces a broken house: it is rejected and replaced before the player ever sees it.

## Acceptance criteria

1. **Every house is solvable.** Each generated house has a route from start to goal, and the player can never get stuck in a part of the house with no way to the goal. Houses that fail this check are regenerated, so no seed ever leads to an unplayable game.
2. **Seeds are reproducible.** The same seed always gives the same rooms, door connections and furniture.
3. **Difficulty changes the house.** Easy has a few rooms, the goal at least 4 doors away and mostly two-way doors. Medium needs at least 6 doors. Hard has many rooms, the goal at least 8 doors away and mostly one-way doors.
4. **Rooms are furnished sensibly.** Every room has a type (kitchen, bedroom, bathroom…) and furniture that fits it. Doors and walkways always stay free.
5. **Doors are portals.** Through every open door the connected room is visible in real time, and walking through has no jump or loading screen.
6. **The geometry is impossible but consistent.** One-way doors, several doors into one room and walled-up doors all behave the same way every time.
7. **The solution can always be shown.** The debug view draws the house as a map with the guaranteed route from the player's current room to the goal. Using it is recorded with the result.
8. **Results are honest and kept.** The server accepts only moves that are possible in that house. The time and the seed are shown at the end and saved.

Each criterion can be checked by generating many houses, replaying seeds or playing the game.

## Uncertainties and how they are resolved

- **Can live portal doors run smoothly in a browser?** A small prototype comes first. If it is too slow, doors show fewer rooms through other doors.
- **Random generation can create unplayable houses.** Every house is generated, then validated. A failed house is retried from the same seed, so seeds stay reproducible. Mass generation measures how often this happens.
- **Can impossible geometry feel unfair?** Difficulty controls how many doors are one-way: Easy feels almost normal, Hard is truly confusing.
- **Furniture might block the way.** A clear walkway between doors is part of the validation.
- **Could the time be cheated?** The server checks every move and keeps its own clock.

## A small change later

For example, "Hard needs at least 9 doors to the goal", or "results that used the debug view are left off the leaderboard". Either is one rule in one place, and the existing checks show at once whether every house still follows it.
