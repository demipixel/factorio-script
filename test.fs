I don't think this ever worked, this was just a goal to shoot for. I think it was suppose to graph
ax^3 + bx^2 + cx + d on a display

CHAIN {
  alias screenX = seven
  alias screenY = eight
  alias x = NEXT
  alias y = NEXT
  alias on = green
  alias newx = NEXT
  alias testNextX = NEXT
  const screenSize = 60

  IMPORT green

  while (x > 0) {
    if (y > 0) {
      newx = x+1
      testNextX = a*newx*newx*newx + b*newx*newx + c*newx + d
      y += 1
    }
    if (y = screenSize) {
      y = 0
      x = 0
    }
    if (y > 0 and (y = testNextX or y > testNextX)) {
      y = 0
      x += 1
    }

    if (y = 0 and x > 0) {
      y = a*x*x*x + b*x*x + c*x + d
    }
    if (x > 0) {
      EXPORT x as screenX
      EXPORT y as screenY
    }
  }
}