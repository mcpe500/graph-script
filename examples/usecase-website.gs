use diagram

diagram "Website Use Case Diagram":
  width = 1200
  height = 900
  background = "#ffffff"

  system website label="Document Management System"

  actor site_user side="left" label="Site User" order=1
  actor webmaster side="left" label="Webmaster" order=2

  usecase search_docs label="Search Documents" order=1
  usecase browse_docs label="Browse Documents" order=2
  usecase view_events label="View Events" order=3
  usecase login label="Log In" order=4
  usecase upload_docs label="Upload Documents" order=5
  usecase post_event label="Post New Event" order=6
  usecase add_user label="Add User" order=7

  usecase download_docs label="Download Documents" order=1
  usecase preview_doc label="Preview Document" order=2
  usecase upload_docs_ext label="Batch Upload" order=5
  usecase add_user_ext label="Import Users" order=7

  association assoc_user_search from="site_user" to="search_docs"
  association assoc_user_browse from="site_user" to="browse_docs"
  association assoc_user_events from="site_user" to="view_events"
  association assoc_user_login from="site_user" to="login"
  association assoc_user_upload from="site_user" to="upload_docs"

  association assoc_webmaster_upload from="webmaster" to="upload_docs"
  association assoc_webmaster_post from="webmaster" to="post_event"
  association assoc_webmaster_adduser from="webmaster" to="add_user"

  include inc_search_download from="search_docs" to="download_docs"
  include inc_search_preview from="search_docs" to="preview_doc"
  include inc_browse_preview from="browse_docs" to="preview_doc"

  extend ext_upload from="upload_docs_ext" to="upload_docs"
  extend ext_adduser from="add_user_ext" to="add_user"
