Card rendering is now modularized here.

Files:
- `CardButton.jsx` — clickable game card wrapper used by hands
- `CardVisual.jsx` — art + icon overlays based on CRD card presentation ideas
- `cardData.js` — icon URLs / card rendering helpers

Intent:
- keep App layout separate from card rendering details
- make it easier to improve card visuals without tangling board logic
