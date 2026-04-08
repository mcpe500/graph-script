use diagram

diagram "Online Shopping System":
  width = 1400
  height = 800
  background = "#ffffff"

  system shopping label="Online Shopping System"

  actor customer side="left" label="Customer" order=1
  actor payment_service side="right" label="Payment Service" order=1
  actor inventory_system side="right" label="Inventory System" order=2

  usecase browse_products label="Browse Products" order=1
  usecase add_to_cart label="Add to Cart" order=2
  usecase checkout label="Checkout" order=3
  usecase track_order label="Track Order" order=4

  usecase view_details label="View Product Details" order=1
  usecase apply_discount label="Apply Discount" order=3
  usecase process_payment label="Process Payment" order=3

  association a1 from="customer" to="browse_products"
  association a2 from="customer" to="add_to_cart"
  association a3 from="customer" to="checkout"
  association a4 from="customer" to="track_order"

  association a5 from="payment_service" to="process_payment"
  association a6 from="inventory_system" to="browse_products"

  include i1 from="browse_products" to="view_details"
  include i2 from="checkout" to="process_payment"

  extend e1 from="apply_discount" to="checkout"
