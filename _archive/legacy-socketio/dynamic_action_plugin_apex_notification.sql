prompt --application/set_environment
set define off verify off feedback off
whenever sqlerror exit sql.sqlcode rollback
--------------------------------------------------------------------------------
--
-- Oracle APEX export file
--
-- You should run this script using a SQL client connected to the database as
-- the owner (parsing schema) of the application or as a database user with the
-- APEX_ADMINISTRATOR_ROLE role.
--
-- This export file has been automatically generated. Modifying this file is not
-- supported by Oracle and can lead to unexpected application and/or instance
-- behavior now or in the future.
--
-- NOTE: Calls to apex_application_install override the defaults below.
--
--------------------------------------------------------------------------------
begin
wwv_flow_imp.import_begin (
 p_version_yyyy_mm_dd=>'2024.11.30'
,p_release=>'24.2.16'
,p_default_workspace_id=>1000000
,p_default_application_id=>10000001100
,p_default_id_offset=>9021064728645687652
,p_default_owner=>'APEX_DEV'
);
end;
/
 
prompt APPLICATION 10000001100 - Khai báo-Quản trị hệ thống
--
-- Application Export:
--   Application:     10000001100
--   Name:            Khai báo-Quản trị hệ thống
--   Date and Time:   09:37 Monday May 25, 2026
--   Exported By:     HUYNQG@GREENSYS.VN
--   Flashback:       0
--   Export Type:     Component Export
--   Manifest
--     PLUGIN: 149733752905461298424
--   Manifest End
--   Version:         24.2.16
--   Instance ID:     716695910645468
--

begin
  -- replace components
  wwv_flow_imp.g_mode := 'REPLACE';
end;
/
prompt --application/shared_components/plugins/dynamic_action/apex_notification
begin
wwv_flow_imp_shared.create_plugin(
 p_id=>wwv_flow_imp.id(149733752905461298424)
,p_plugin_type=>'DYNAMIC ACTION'
,p_name=>'APEX.NOTIFICATION'
,p_display_name=>'Notification Menu'
,p_category=>'NOTIFICATION'
,p_plsql_code=>wwv_flow_string.join(wwv_flow_t_varchar2(
'FUNCTION F_AJAX (',
'    P_DYNAMIC_ACTION   IN APEX_PLUGIN.T_DYNAMIC_ACTION,',
'    P_PLUGIN           IN APEX_PLUGIN.T_PLUGIN',
') RETURN APEX_PLUGIN.T_DYNAMIC_ACTION_AJAX_RESULT IS',
'    VR_RESULT         APEX_PLUGIN.T_DYNAMIC_ACTION_AJAX_RESULT;',
'BEGIN',
'    APEX_UTIL.JSON_FROM_SQL( SQLQ   => P_DYNAMIC_ACTION.ATTRIBUTE_04 );',
'    RETURN VR_RESULT;',
'END;',
'',
'FUNCTION F_RENDER (',
'    P_DYNAMIC_ACTION   IN APEX_PLUGIN.T_DYNAMIC_ACTION,',
'    P_PLUGIN           IN APEX_PLUGIN.T_PLUGIN',
') RETURN APEX_PLUGIN.T_DYNAMIC_ACTION_RENDER_RESULT AS',
'    VR_RESULT         APEX_PLUGIN.T_DYNAMIC_ACTION_RENDER_RESULT;',
'    VR_REQUIRE_ESCAPE BOOLEAN := TRUE;',
'    VR_SANITIZE       BOOLEAN := TRUE;',
'BEGIN',
'    APEX_JAVASCRIPT.ADD_LIBRARY(',
'        P_NAME        => ''notification.min'',',
'        P_DIRECTORY   => ''#THEME_IMAGES#&WORKSPACE_ID./js/'',',
'        P_VERSION     => NULL,',
'        P_KEY         => ''noteMenuSource''',
'    );',
'',
'    IF',
'        P_DYNAMIC_ACTION.ATTRIBUTE_05 = ''N''',
'    THEN',
'        VR_REQUIRE_ESCAPE   := FALSE;',
'    ELSE',
'        VR_REQUIRE_ESCAPE   := TRUE;',
'    END IF;',
'    ',
'    IF',
'        P_DYNAMIC_ACTION.ATTRIBUTE_06 = ''N''',
'    THEN',
'        VR_SANITIZE   := FALSE;',
'    ELSE',
'        VR_SANITIZE   := TRUE;',
'    END IF;',
'',
'    VR_RESULT.JAVASCRIPT_FUNCTION   := ''function () {',
'  notificationMenu.initialize('' ||',
'    APEX_JAVASCRIPT.ADD_VALUE( P_DYNAMIC_ACTION.ATTRIBUTE_02, TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( APEX_PLUGIN.GET_AJAX_IDENTIFIER, TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( P_DYNAMIC_ACTION.ATTRIBUTE_01, TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( APEX_PLUGIN_UTIL.PAGE_ITEM_NAMES_TO_JQUERY(P_DYNAMIC_ACTION.ATTRIBUTE_03), TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( VR_REQUIRE_ESCAPE, TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( VR_SANITIZE, TRUE ) ||',
'    APEX_JAVASCRIPT.ADD_VALUE( P_DYNAMIC_ACTION.ATTRIBUTE_07, FALSE ) ||',
'    '');}'';',
'',
'    RETURN VR_RESULT;',
'END;'))
,p_api_version=>1
,p_render_function=>'F_RENDER'
,p_ajax_function=>'F_AJAX'
,p_substitute_attributes=>true
,p_version_scn=>6907388626
,p_subscribe_plugin_settings=>true
,p_help_text=>wwv_flow_string.join(wwv_flow_t_varchar2(
'This dynamic action plugin allows to render a notification menu which gets its information through an SQL statement. It also has many configuration options and an automatic refresh (if desired). Unfortunately, it is only available with the Universal '
||'Theme 1.1 in Apex 5.1.1 or above. If you want to use it in older Themes then you have to customize the CSS style.',
'',
'To Trigger a manual refresh just create a dynmic action e.g. on button click with the action "Refresh" and set as "Affected Element" a jQuery Selector. Then enter the ID that was set as Element ID for Notification Menu.'))
,p_files_version=>1348
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(149733753170315298427)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>1
,p_display_sequence=>4
,p_prompt=>'ConfigJSON'
,p_attribute_type=>'JAVASCRIPT'
,p_is_required=>true
,p_default_value=>wwv_flow_string.join(wwv_flow_t_varchar2(
'{',
'    "refresh": 0,',
'    "mainIcon": "icon-bell",',
'    "mainIconColor": "white",',
'    "mainIconBackgroundColor": "transparent",',
'    "mainIconBlinking": false,',
'    "counterBackgroundColor": "rgb(232, 55, 55 )",',
'    "counterFontColor": "white",',
'    "linkTargetBlank": false,',
'    "showAlways": false,',
'    "browserNotifications": {',
'        "enabled": true,',
'        "cutBodyTextAfter": 100,',
'        "link": false',
'    },',
'    "hideOnRefresh": true',
'}'))
,p_is_translatable=>false
,p_help_text=>wwv_flow_string.join(wwv_flow_t_varchar2(
'<pre>',
'{',
'    "refresh": 0,',
'    "mainIcon": "icon-bell",',
'    "mainIconColor": "white",',
'    "mainIconBackgroundColor": "transparent",',
'    "mainIconBlinking": false,',
'    "counterBackgroundColor": "rgb(232, 55, 55 )",',
'    "counterFontColor": "white",',
'    "linkTargetBlank": false,',
'    "showAlways": false,',
'    "browserNotifications": {',
'        "enabled": true,',
'        "cutBodyTextAfter": 100,',
'        "link": false',
'    },',
'    "hideOnRefresh": true',
'}',
'</pre>',
'<br>',
'<h3>Explanation:</h3>',
'  <dl>',
'  <dt>refresh (number)</dt>',
'  <dd>refresh time of cards in seconds if 0 then no refresh will be set</dd>',
'  <dl>',
'  <dt>mainIcon(string)</dt>',
'  <dd>icon of the menu</dd>',
'  <dl>',
'  <dt>mainIconColor(string)</dt>',
'  <dd>color of the icon e.g. #ffffff, green...</dd>',
'  <dl>',
'  <dt>counterBackgroundColor(string)</dt>',
'  <dd>color of the icon background e.g. #ffffff, green...</dd>',
'  <dl>',
'  <dt>mainIconBlinking(boolean)</dt>',
'  <dd>used to get icon blinking</dd>',
'  <dl>',
'  <dt>counterBackgroundColor(string)</dt>',
'  <dd>color of the counter background e.g. #ffffff, green...</dd>',
'  <dl>',
'  <dt>counterFontColor(string)</dt>',
'  <dd>color of the counter font color e.g. #ffffff, green...</dd>',
'  <dl>',
'  <dt>linkTargetBlank(boolean)</dt>',
'  <dd>link to target blank or not</dd>',
'  <dl>',
'  <dt>showAlways(boolean)</dt>',
'  <dd>Use to set if also shown when no notifications occured</dd>',
'  <dt>browserNotifications.enable(boolean)</dt>',
'  <dd>Use the notification API of the browser to show notifications</dd>',
'  <dt>browserNotifications.cutBodyTextAfter(number)</dt>',
'  <dd>Set max length of shown body text</dd>',
'  <dt>browserNotifications.link(boolean)</dt>',
'  <dd>set if link of node entry is directly called or if just when click on notification the browser tab is openend where notification was fired</dd>',
'  <dt>hideOnRefresh(boolean)</dt>',
'  <dd>Set if Notification menu should hide on Refresh.</dd>'))
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(149735359770152476056)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>2
,p_display_sequence=>3
,p_prompt=>'Element ID'
,p_attribute_type=>'TEXT'
,p_is_required=>true
,p_default_value=>'notification-menu'
,p_is_translatable=>false
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(149764634269622564729)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>3
,p_display_sequence=>2
,p_prompt=>'Items to Submit'
,p_attribute_type=>'PAGE ITEMS'
,p_is_required=>false
,p_is_translatable=>false
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(149764645846375567694)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>4
,p_display_sequence=>1
,p_prompt=>'SQL Source'
,p_attribute_type=>'SQL'
,p_is_required=>true
,p_default_value=>wwv_flow_string.join(wwv_flow_t_varchar2(
'SELECT /* sets the status of the list item */',
'    0 AS NOTE_STATUS,',
'    /* sets the title of the list item (html possible) */',
unistr('    ''\0110\01A1n ha\0300ng ch\01A1\0300 duy\00EA\0323t'' AS NOTE_HEADER,'),
'    /* sets the text of the list item (html possible) */',
unistr('    ''\0110\01A1n ha\0300ng co\0301 ma\0303 s\00F4\0301 <b style="color:rgb(214, 59, 37);"> DH-123456 </b> \0111ang ch\01A1\0300 duy\00EA\0323t.'' AS NOTE_TEXT, '),
'    /* sets the information of the list item (html possible) */',
unistr('    ''Hoa\0300ng D\01B0\01A1\0323c S\01B0 &emsp; 20-02-2022 11:02:40'' AS NOTE_INFORMATION,'),
'    /* set the link when click on list item */',
'    ''javascript:alert("Click on Notification Entry");void(0);'' AS NOTE_LINK,',
'    /* Link or js that is executed when press delete link */ ',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL',
'UNION ALL',
'SELECT',
'    0 AS NOTE_STATUS,',
unistr('    ''Ba\0309ng gia\0301 trong tha\0301ng 02-2022 ch\01A1\0300 duy\00EA\0323t'' AS NOTE_HEADER,'),
unistr('    ''Danh sa\0301ch gia\0301 m\01A1\0301i nh\00E2\0301t ca\0301c m\0103\0323t ha\0300ng trong tha\0301ng <b>02-2022</b> cu\0309a c\00F4ng ty.'' AS NOTE_TEXT,'),
unistr('    ''\00C2u D\01B0\01A1ng Phong &emsp; 22-02-2022 09:30:34'' AS NOTE_INFORMATION,'),
'    ''https://greensys.com.vn'' AS NOTE_LINK,',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL    ',
'UNION ALL',
'SELECT',
'    1 AS NOTE_STATUS,',
unistr('    ''Li\0323ch ba\0309o tri\0300 ma\0301y chu\0309 \0111i\0323nh ky\0300'' AS NOTE_HEADER,'),
unistr('    ''Trong th\01A1\0300i gian t\01B0\0300 <b>08:30</b> \0111\00EA\0301n <b>11:00</b> ma\0301y chu\0309 h\00EA\0323 th\00F4\0301ng se\0303 ng\01B0\0300ng cung c\00E2\0301p di\0323ch vu\0323 \0111\00EA\0309 ba\0309o tri\0300. Mo\0323i l\01B0u tr\01B0\0303 trong th\01A1\0300i gian na\0300y se\0303 bi\0323 v\00F4 hi\00EA\0323u ho\0301a.'' AS NOTE_TEXT,'),
unistr('    ''H\00F4\0300ng Th\00E2\0301t C\00F4ng &emsp; 22-02-2022 08:04:15'' AS NOTE_INFORMATION,'),
'    ''https://greensys.com.vn'' AS NOTE_LINK,',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL'))
,p_sql_min_column_count=>1
,p_is_translatable=>false
,p_help_text=>wwv_flow_string.join(wwv_flow_t_varchar2(
'<pre>',
'SELECT /* sets the status of the list item */',
'    0 AS NOTE_STATUS,',
'    /* sets the title of the list item (html possible) */',
unistr('    ''\0110\01A1n ha\0300ng ch\01A1\0300 duy\00EA\0323t'' AS NOTE_HEADER,'),
'    /* sets the text of the list item (html possible) */',
unistr('    ''\0110\01A1n ha\0300ng co\0301 ma\0303 s\00F4\0301 <b style="color:rgb(214, 59, 37);"> DH-123456 </b> \0111ang ch\01A1\0300 duy\00EA\0323t.'' AS NOTE_TEXT, '),
'    /* sets the information of the list item (html possible) */',
unistr('    ''Hoa\0300ng D\01B0\01A1\0323c S\01B0 &emsp; 20-02-2022 11:02:40'' AS NOTE_INFORMATION,'),
'    /* set the link when click on list item */',
'    ''javascript:alert("Click on Notification Entry");void(0);'' AS NOTE_LINK,',
'    /* Link or js that is executed when press delete link */ ',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL',
'UNION ALL',
'SELECT',
'    0 AS NOTE_STATUS,',
unistr('    ''Ba\0309ng gia\0301 trong tha\0301ng 02-2022 ch\01A1\0300 duy\00EA\0323t'' AS NOTE_HEADER,'),
unistr('    ''Danh sa\0301ch gia\0301 m\01A1\0301i nh\00E2\0301t ca\0301c m\0103\0323t ha\0300ng trong tha\0301ng <b>02-2022</b> cu\0309a c\00F4ng ty.'' AS NOTE_TEXT,'),
unistr('    ''\00C2u D\01B0\01A1ng Phong &emsp; 22-02-2022 09:30:34'' AS NOTE_INFORMATION,'),
'    ''https://greensys.com.vn'' AS NOTE_LINK,',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL    ',
'UNION ALL',
'SELECT',
'    1 AS NOTE_STATUS,',
unistr('    ''Li\0323ch ba\0309o tri\0300 ma\0301y chu\0309 \0111i\0323nh ky\0300'' AS NOTE_HEADER,'),
unistr('    ''Trong th\01A1\0300i gian t\01B0\0300 <b>08:30</b> \0111\00EA\0301n <b>11:00</b> ma\0301y chu\0309 h\00EA\0323 th\00F4\0301ng se\0303 ng\01B0\0300ng cung c\00E2\0301p di\0323ch vu\0323 \0111\00EA\0309 ba\0309o tri\0300. Mo\0323i l\01B0u tr\01B0\0303 trong th\01A1\0300i gian na\0300y se\0303 bi\0323 v\00F4 hi\00EA\0323u ho\0301a.'' AS NOTE_TEXT,'),
unistr('    ''H\00F4\0300ng Th\00E2\0301t C\00F4ng &emsp; 22-02-2022 08:04:15'' AS NOTE_INFORMATION,'),
'    ''https://greensys.com.vn'' AS NOTE_LINK,',
'    ''javascript:alert("Deleted");void(0);'' AS NOTE_DELETE,',
'    /* When enable Browser Notifications in ConfigJSON then you can select which notifications should not be fire browser not. */',
'    0 AS NO_BROWSER_NOTIFICATION',
'FROM',
'    DUAL',
'</pre>'))
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(84714130145149694992)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>5
,p_display_sequence=>50
,p_prompt=>'Escape special Characters'
,p_attribute_type=>'CHECKBOX'
,p_is_required=>false
,p_default_value=>'Y'
,p_is_translatable=>false
,p_help_text=>'This value determines whether all texts that the plug-in inserts into the page should be escaped. This is necessary if texts come from user input or insecure sources to prevent XSS.'
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(38988423835841151323)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>6
,p_display_sequence=>60
,p_prompt=>'Sanitize HTML'
,p_attribute_type=>'CHECKBOX'
,p_is_required=>false
,p_default_value=>'Y'
,p_is_translatable=>false
,p_depending_on_attribute_id=>wwv_flow_imp.id(84714130145149694992)
,p_depending_on_has_to_exist=>true
,p_depending_on_condition_type=>'NOT_EQUALS'
,p_depending_on_expression=>'Y'
,p_help_text=>'Sanitizes HTML e.g. &lt;script&gt; tags will be removed.'
);
wwv_flow_imp_shared.create_plugin_attribute(
 p_id=>wwv_flow_imp.id(38988448091876153983)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_attribute_scope=>'COMPONENT'
,p_attribute_sequence=>7
,p_display_sequence=>70
,p_prompt=>'Sanitize HTML Options'
,p_attribute_type=>'JAVASCRIPT'
,p_is_required=>true
,p_default_value=>wwv_flow_string.join(wwv_flow_t_varchar2(
'{',
'  "ALLOWED_ATTR": [',
'    "accesskey",',
'    "align",',
'    "alt",',
'    "always",',
'    "autocomplete",',
'    "autoplay",',
'    "border",',
'    "cellpadding",',
'    "cellspacing",',
'    "charset",',
'    "class",',
'    "colspan",',
'    "dir",',
'    "height",',
'    "href",',
'    "id",',
'    "lang",',
'    "name",',
'    "rel",',
'    "required",',
'    "rowspan",',
'    "src",',
'    "style",',
'    "summary",',
'    "tabindex",',
'    "target",',
'    "title",',
'    "type",',
'    "value",',
'    "width"',
'  ],',
'  "ALLOWED_TAGS": [',
'    "a",',
'    "address",',
'    "b",',
'    "blockquote",',
'    "br",',
'    "caption",',
'    "code",',
'    "dd",',
'    "div",',
'    "dl",',
'    "dt",',
'    "em",',
'    "figcaption",',
'    "figure",',
'    "h1",',
'    "h2",',
'    "h3",',
'    "h4",',
'    "h5",',
'    "h6",',
'    "hr",',
'    "i",',
'    "img",',
'    "label",',
'    "li",',
'    "nl",',
'    "ol",',
'    "p",',
'    "pre",',
'    "s",',
'    "span",',
'    "strike",',
'    "strong",',
'    "sub",',
'    "sup",',
'    "table",',
'    "tbody",',
'    "td",',
'    "th",',
'    "thead",',
'    "tr",',
'    "u",',
'    "ul"',
'  ]',
'}'))
,p_is_translatable=>false
,p_depending_on_attribute_id=>wwv_flow_imp.id(38988423835841151323)
,p_depending_on_has_to_exist=>true
,p_depending_on_condition_type=>'EQUALS'
,p_depending_on_expression=>'Y'
,p_help_text=>wwv_flow_string.join(wwv_flow_t_varchar2(
'This Clob Loader includes a sanitizer for HTML as option to use:',
'A Full Description you will find on: https://github.com/cure53/DOMPurify',
'Example: ',
'<pre>',
'{',
'  "ALLOWED_ATTR": [',
'    "accesskey",',
'    "align",',
'    "alt",',
'    "always",',
'    "autocomplete",',
'    "autoplay",',
'    "border",',
'    "cellpadding",',
'    "cellspacing",',
'    "charset",',
'    "class",',
'    "colspan",',
'    "dir",',
'    "height",',
'    "href",',
'    "id",',
'    "lang",',
'    "name",',
'    "rel",',
'    "required",',
'    "rowspan",',
'    "src",',
'    "style",',
'    "summary",',
'    "tabindex",',
'    "target",',
'    "title",',
'    "type",',
'    "value",',
'    "width"',
'  ],',
'  "ALLOWED_TAGS": [',
'    "a",',
'    "address",',
'    "b",',
'    "blockquote",',
'    "br",',
'    "caption",',
'    "code",',
'    "dd",',
'    "div",',
'    "dl",',
'    "dt",',
'    "em",',
'    "figcaption",',
'    "figure",',
'    "h1",',
'    "h2",',
'    "h3",',
'    "h4",',
'    "h5",',
'    "h6",',
'    "hr",',
'    "i",',
'    "img",',
'    "label",',
'    "li",',
'    "nl",',
'    "ol",',
'    "p",',
'    "pre",',
'    "s",',
'    "span",',
'    "strike",',
'    "strong",',
'    "sub",',
'    "sup",',
'    "table",',
'    "tbody",',
'    "td",',
'    "th",',
'    "thead",',
'    "tr",',
'    "u",',
'    "ul"',
'  ]',
'}',
'</pre>',
'<pre>',
'# make output safe for usage in jQuery''s $()/html() method (default is false)',
'SAFE_FOR_JQUERY: true',
'',
'# strip {{ ... }} and &amp;lt;% ... %&amp;gt; to make output safe for template systems',
'# be careful please, this mode is not recommended for production usage.',
'# allowing template parsing in user-controlled HTML is not advised at all.',
'# only use this mode if there is really no alternative.',
'SAFE_FOR_TEMPLATES: true',
'',
'# allow only &amp;lt;b&amp;gt;',
'ALLOWED_TAGS: [''b'']',
'',
'# allow only &amp;lt;b&amp;gt; and &amp;lt;q&amp;gt; with style attributes (for whatever reason)',
'ALLOWED_TAGS: [''b'', ''q''], ALLOWED_ATTR: [''style'']',
'',
'# allow all safe HTML elements but neither SVG nor MathML',
'USE_PROFILES: {html: true}',
'',
'# allow all safe SVG elements and SVG Filters',
'USE_PROFILES: {svg: true, svgFilters: true}',
'',
'# allow all safe MathML elements and SVG',
'USE_PROFILES: {mathMl: true, svg: true}',
'',
'# leave all as it is but forbid &amp;lt;style&amp;gt;',
'FORBID_TAGS: [''style'']',
'',
'# leave all as it is but forbid style attributes',
'FORBID_ATTR: [''style'']',
'',
'# extend the existing array of allowed tags',
'ADD_TAGS: [''my-tag'']',
'',
'# extend the existing array of attributes',
'ADD_ATTR: [''my-attr'']',
'',
'# prohibit HTML5 data attributes (default is true)',
'ALLOW_DATA_ATTR: false',
'',
'# allow external protocol handlers in URL attributes (default is false)',
'# by default only http, https, ftp, ftps, tel, mailto, callto, cid and xmpp are allowed.',
'ALLOW_UNKNOWN_PROTOCOLS: true',
'</pre>'))
);
wwv_flow_imp_shared.create_plugin_event(
 p_id=>wwv_flow_imp.id(28701046075706037484)
,p_plugin_id=>wwv_flow_imp.id(149733752905461298424)
,p_name=>'refresh-notification-menu'
,p_display_name=>'Refresh Notification Menu'
);
end;
/
prompt --application/end_environment
begin
wwv_flow_imp.import_end(p_auto_install_sup_obj => nvl(wwv_flow_application_install.get_auto_install_sup_obj, false)
);
commit;
end;
/
set verify on feedback on define on
prompt  ...done
