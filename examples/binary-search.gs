use chart

algo BinarySearch(arr, target):
  low = 0
  high = len(arr) - 1

  while low <= high:
    mid = floor((low + high) / 2)

    emit:
      step = low + high
      low = low
      high = high
      mid = mid

    if arr[mid] == target:
      return mid
    else if arr[mid] < target:
      low = mid + 1
    else:
      high = mid - 1

  return -1

data:
  sorted = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  result = BinarySearch(sorted, 11)

chart "Search Trace":
  type = line
  x = step
  y = mid
  xlabel = "iteration"
  ylabel = "mid value"
