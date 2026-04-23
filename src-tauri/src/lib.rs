use std::sync::{Arc, Mutex};
use base64::Engine;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct AppState {
    opened_files: Arc<Mutex<Vec<String>>>,
    pending_files: Arc<Mutex<Vec<String>>>,
}

#[tauri::command]
fn get_opened_files(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let files = state.opened_files.lock().unwrap();
    files.clone()
}

#[tauri::command]
fn get_pending_files(app: tauri::AppHandle) -> Vec<String> {
    let state = app.state::<AppState>();
    let mut pending = state.pending_files.lock().unwrap();
    let files = pending.clone();
    pending.clear();
    files
}

#[tauri::command]
fn read_file_as_data_url(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    let lower = path.to_lowercase();
    let mime = if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn is_image_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".bmp")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Store image files from secondary instance into pending_files
            let state = app.state::<AppState>();
            let mut pending = state.pending_files.lock().unwrap();
            for arg in &args {
                if is_image_path(arg) {
                    pending.push(arg.clone());
                }
            }
            // Notify frontend that new files are available
            let _ = app.emit("single-instance-files", ());
        }))
        .manage(AppState::default())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .target(tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir { file_name: None },
                    ))
                    .build(),
            )?;

            // Read command-line arguments (file paths from "Open with")
            let args: Vec<String> = std::env::args().collect();
            log::info!("CLI args: {:?}", args);
            if args.len() > 1 {
                let state = app.state::<AppState>();
                let mut opened_files = state.opened_files.lock().unwrap();
                for arg in args.iter().skip(1) {
                    if is_image_path(arg) {
                        opened_files.push(arg.clone());
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_opened_files,
            get_pending_files,
            read_file_as_data_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
