fn main() {
  tauri_build::build();

  // Ensure Cargo.toml version stays in sync with package.json
  let pkg_json = std::fs::read_to_string("../package.json")
    .expect("failed to read ../package.json");
  let pkg: serde_json::Value = serde_json::from_str(&pkg_json)
    .expect("failed to parse ../package.json");
  let pkg_version = pkg["version"].as_str().unwrap();
  let cargo_version = env!("CARGO_PKG_VERSION");

  if pkg_version != cargo_version {
    panic!(
      "Version mismatch: package.json has \"{}\" but Cargo.toml has \"{}\". Please update Cargo.toml.",
      pkg_version, cargo_version
    );
  }
}
