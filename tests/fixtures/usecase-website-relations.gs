use diagram

diagram "UseCaseLabels":
  width = 1200
  height = 900
  background = "#ffffff"

  system website label="Website Use Case Diagram"

  actor site_user side="left" label="Site user" order=1
  actor webmaster side="left" label="Webmaster" order=2

  usecase search_docs label="Search docs - full text" order=1
  usecase download_docs label="Download doccs" order=1
  usecase browse_docs label="Browse docs" order=2
  usecase preview_doc label="Preview doc" order=2
  usecase view_events label="View events" order=3
  usecase login label="Log in" order=4
  usecase upload_docs label="Upload docs" order=5
  usecase upload_docs_ext label="Upload docs" order=5
  usecase post_event label="Post new event to homepage" order=6
  usecase add_user label="Add user" order=7
  usecase add_user_ext label="Add user" order=7

  association assoc_user_search from="site_user" to="search_docs"
  association assoc_user_browse from="site_user" to="browse_docs"
  association assoc_user_events from="site_user" to="view_events"
  association assoc_user_login from="site_user" to="login"
  association assoc_user_upload from="site_user" to="upload_docs"

  association assoc_webmaster_upload from="webmaster" to="upload_docs"
  association assoc_webmaster_post from="webmaster" to="post_event"
  association assoc_webmaster_adduser from="webmaster" to="add_user"

  include include_search_download from="search_docs" to="download_docs"
  include include_search_preview from="search_docs" to="preview_doc"
  include include_browse_preview from="browse_docs" to="preview_doc"

  extend extend_upload from="upload_docs_ext" to="upload_docs"
  extend extend_adduser from="add_user_ext" to="add_user"
