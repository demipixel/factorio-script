chain {
  alias on = crude_oil
  while water < 500 && (water > 0 || on > 0) {
    water += 1
  }
}