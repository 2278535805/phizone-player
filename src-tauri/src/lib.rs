use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use tauri::Emitter;
use tauri::Manager;
use url::Url;

static INCOMING_FILES: LazyLock<Mutex<Vec<PathBuf>>> = LazyLock::new(|| Mutex::new(vec![]));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let mut files: Vec<PathBuf> = Vec::new();
            parse_incoming_files(&mut files, args.iter().map(|s| s.to_string()));
            let window = app.get_webview_window("main").expect("no main window");
            window
                .emit(
                    "incoming-files",
                    files
                        .into_iter()
                        .map(|f| f.to_string_lossy().into_owned())
                        .collect::<Vec<String>>(),
                )
                .unwrap();
            let _ = window.set_focus();
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                // register deep links
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;

                // handle associated files
                parse_incoming_files(&mut INCOMING_FILES.lock().unwrap(), std::env::args());
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_incoming_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn parse_incoming_files<T: Iterator<Item = String>>(files: &mut Vec<PathBuf>, args: T) {
    // seek for files in the command line arguments
    for maybe_file in args.skip(1) {
        println!("may-be file: {:?}", maybe_file);
        // skip flags like -f or --flag
        if maybe_file.starts_with('-') {
            continue;
        }

        let mut success = false;
        // handle `file://` path urls and skip other urls
        if let Ok(url) = Url::parse(&maybe_file) {
            if !url.cannot_be_a_base() {
                if let Ok(path) = url.to_file_path() {
                    files.push(path);
                    success = true;
                }
            }
        }
        if !success {
            files.push(PathBuf::from(maybe_file))
        }
    }
    println!("incoming files ({:?}): {:?}", files.len(), files);
}

#[tauri::command]
fn get_incoming_files() -> Vec<String> {
    INCOMING_FILES
        .lock()
        .unwrap()
        .clone()
        .into_iter()
        .map(|f| f.to_string_lossy().into_owned())
        .collect()
}
