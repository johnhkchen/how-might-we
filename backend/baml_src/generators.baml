generator target {
  output_type "go"
  output_dir "../"
  version "0.216.0"
  client_package_name "github.com/hmw-workshop/backend"
  on_generate "gofmt -w . && goimports -w . && go mod tidy"
}
