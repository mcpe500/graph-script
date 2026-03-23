use chart

data:
  xs = range(0, 10, 1)
  ys = [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]

chart "Squares":
  type = line
  x = xs
  y = ys
  xlabel = "x"
  ylabel = "x^2"
