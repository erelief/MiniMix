use std::sync::{Arc, Mutex};
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

fn is_image_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".bmp")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
}

fn format_bytes(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

#[tauri::command]
fn compress_and_save_png(data: Vec<u8>, path: String) -> Result<String, String> {
    let original_size = data.len();
    let opts = oxipng::Options {
        strip: oxipng::StripChunks::Safe,
        ..Default::default()
    };

    let final_data = match oxipng::optimize_from_memory(&data, &opts) {
        Ok(compressed) if compressed.len() < original_size => compressed,
        _ => data,
    };

    std::fs::write(&path, &final_data)
        .map_err(|e| format!("文件写入失败: {}", e))?;

    let compressed_size = final_data.len();
    let savings = (original_size - compressed_size) as f64 / original_size as f64 * 100.0;

    Ok(format!(
        "已保存: {} ({} → {}, {:.1}% 更小)",
        path,
        format_bytes(original_size),
        format_bytes(compressed_size),
        savings
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
            compress_and_save_png,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
