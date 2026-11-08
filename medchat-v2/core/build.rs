// napi-rs: флаги линковки cdylib-аддона (на Linux — фактически no-op;
// cargo test и rlib-пути не затрагивает).
extern crate napi_build;

fn main() {
    napi_build::setup();
}
