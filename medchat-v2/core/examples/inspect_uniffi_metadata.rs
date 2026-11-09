use camino::Utf8Path;

fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: inspect_uniffi_metadata <library-path>");
    match uniffi_bindgen::macro_metadata::extract_from_library(Utf8Path::new(&path)) {
        Ok(items) => println!("UniFFI metadata items: {}", items.len()),
        Err(error) => {
            eprintln!("UniFFI metadata extraction failed:\n{error:#}");
            std::process::exit(1);
        }
    }
}
