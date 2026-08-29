export function authenticP2Joined(playerCountM1, formationState = null) {
  return !formationState && playerCountM1 === 1;
}

export function latchAuthenticP2Joined(joined, playerCountM1,
  formationState = null) {
  return Boolean(joined)
    || authenticP2Joined(playerCountM1, formationState);
}
