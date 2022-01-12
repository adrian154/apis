# apis

A collection of random APIs. I mainly add methods as I need them, but PRs are welcome. All these endpoints are publicly available at https://apis.bithole.dev

# /ip

**Method:** GET

**Parameters:** None

**Response:** The IP which the request was made from.

# /headers

**Method:** GET

**Parameters:**
* `h`: (optional string) a specific header

**Response:** If `h` is provided, the specific header is sent. Otherwise, a JSON object is sent, where the keys and values are the header names and values respectively.

# /embed

**Method:** GET

**Parameters:**
* `title`: (optional string) embed title (equivalent to `og:title`)
* `desc`: (optional string) embed description (equivalent to `og:description`)
* `image`: (optional string) embed thumbnail (equivalent to `og:image`)

**Response:** An HTML document with OpenGraph meta tags equivalent to the parameters specified.

# /mc/ping-server

**Method:** GET

**Parameters:**
* `host`: (optional string) server hostname
* `port`: (optional string) server port

**Response:** If the server is online, the JSON response sent by the server ([docs](https://github.com/adrian154/node-mc-api#apipingserverhost-options)). If the server failed, a JSON object with an `error` field containing an error message. Values are cached for some time.

# /cors-proxy

**Method:** GET POST PUT DELETE PATCH

**Parameters:**
* `url`: (string) URL of request to proxy
* Additional parameters are sent as headers in the response, overriding the header with the original request if present. This can be used to set custom headers on arbitrary requests.

**Response:** The status code and data returned by the resource located at the request URL, a 400 error if the `url` field was invalid, or a 500 error if an error occurred while making the request. By default, the Access-Control-Allow-Origin header is set to `*`.