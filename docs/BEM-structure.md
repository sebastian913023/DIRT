# DIRT — BEM Class Architecture

## Block Map

```
page                       — root layout shell
nav                        — top navigation bar
  nav__logo                — DIRT wordmark
secure-badge               — SSL/Stripe trust indicator
  secure-badge__dot        — animated green pulse dot
overlay                    — Stripe loading fullscreen
  overlay__spinner         — CSS spinner ring
  overlay__message         — rotating status text
  overlay__error           — error display
  [overlay--visible]       — shown state
checkout                   — two-column main grid
  checkout__offer          — left sticky column
  checkout__form           — right form column
offer                      — hero copy block
  offer__eyebrow           — "OPERATION SHELL BREAK" label
  offer__title             — big display heading
  offer__title-highlight   — amber accent span
price-box                  — price display card
  price-box__was           — struck-through original price
  price-box__amount        — big $10 number
  price-box__period        — "30 DAYS · FULL ACCESS" text
  price-box__fine          — fine print
  price-box__countdown     — expiry timer bar
  price-box__countdown-value — live timer digits
agents                     — 6-agent list wrapper
  agents__title            — "YOUR 6-AGENT TEAM"
agent                      — individual agent card
  agent__icon              — glyph symbol
  agent__info              — name+role wrapper
  agent__name              — agent codename
  agent__role              — job description
  agent__model             — AI model badge
  [agent:hover]            — hover border glow
includes                   — feature checklist
  includes__title          — "WHAT'S INCLUDED"
  includes__item           — single feature row
  includes__check          — green ✓ mark
trust                      — trust signal row
  trust__item              — individual badge
  trust__icon              — green ✓
proof                      — live activity strip
  proof__title             — "🔴 LIVE ACTIVITY"
  proof__item              — single activity row
  proof__dot               — blinking green dot
steps                      — step indicator bar
step                       — single step tab
  step__number             — big "01/02/03"
  [step--active]           — current step
  [step--done]             — completed step
progress                   — thin progress bar
  progress__fill           — animated fill
panel                      — multi-step form panel
  panel__title             — step heading
  panel__description       — step sub-copy
  panel__actions           — back+continue button row
  [panel--active]          — visible panel
field                      — single form field unit
  field__label             — input label
  field__input             — text/select/textarea
  field__hint              — helper text below
  field__error             — validation error text
  [field--pair]            — two-column grid modifier
  [field__input--error]    — invalid state
  [field__input--no-right-border] — joined to referral btn
referral                   — referral code row
  referral__btn            — APPLY button
  referral__message        — success/error feedback
  [referral__message--visible]  — shown state
  [referral__message--invalid]  — red error state
order                      — order summary box
  order__heading           — "ORDER SUMMARY"
  order__row               — line item row
  order__label             — left label
  order__value             — right value
  order__total             — total row wrapper
  order__total-label       — "TODAY'S TOTAL"
  order__total-value       — big price display
  order__legal             — fine print security text
  [order__row--discount]   — green referral row
  [order__value--accent]   — amber model name
  [order__value--discount] — green discount amount
profile                    — confirmed user data summary
  profile__heading         — "YOUR PROFILE" label
  profile__value           — white data value
btn                        — button base (not standalone)
  btn__inner               — flex centering wrapper
  btn__arrow               — → arrow span
  [btn--primary]           — amber CTA button
  [btn--back]              — ghost back link
```

## Modifier Convention

```
.block--modifier       State/variant of a block
.block__element        Part of a block
.block__element--modifier  State of an element
```

## What We Avoided

- No `.flat-compound-names` (was: agent-row, form-panel, offer-side)
- No `.block.state` (was: .step.active, .form-panel.active, .field-input.error)
- No inline style="" on structural elements
- No empty rules (.checkout-side{})
- No dual ID+class on same selector (#discount-row + .discount-row)
