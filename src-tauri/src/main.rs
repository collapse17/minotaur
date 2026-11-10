#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::process::Command;
use tauri::Manager;
use std::io::Write;
use std::sync::Mutex;
static LOG_LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
fn write_log(event: String, details: serde_json::Value) -> Result<(), String> {
    let _guard = LOG_LOCK.lock().map_err(|e| e.to_string())?;
    let base = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
    } else {
        std::env::current_exe().map_err(|e| e.to_string())?.parent().ok_or("Нет каталога приложения")?.to_path_buf()
    };
    let directory = base.join("logs");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(directory.join(format!("minotaur-{}.jsonl", timestamp / 86_400_000))).map_err(|e| e.to_string())?;
    let record = serde_json::json!({"timestampMs": timestamp, "event": event, "details": details});
    writeln!(file, "{}", record).map_err(|e| e.to_string())
}

#[tauri::command]
fn finish_startup(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|e| e.to_string())?;
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splash") {
        splash.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn inventory() -> Result<serde_json::Value, String> {
    let script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); @{ computerName=$env:COMPUTERNAME; computer=Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory; bios=Get-CimInstance Win32_BIOS | Select-Object SerialNumber,SMBIOSBIOSVersion; cpu=@(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores); disks=@(Get-CimInstance Win32_DiskDrive | Select-Object Model,SerialNumber,Size); os=Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version } | ConvertTo-Json -Depth 5 -Compress";
    let output = Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", script]).output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).to_string()); }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}
#[tauri::command]
fn execute_command(executable: String, arguments: Vec<String>, working_directory: String) -> Result<serde_json::Value, String> {
    let base = std::env::current_exe().map_err(|e| e.to_string())?.parent().ok_or("Нет каталога приложения")?.to_path_buf();
    let cwd = base.join(working_directory);
    let path = std::path::Path::new(&executable);
    let program = if path.is_absolute() || path.components().count() > 1 { cwd.join(path) } else { path.to_path_buf() };
    let mut command = Command::new(program);
    command.args(arguments).current_dir(cwd);
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let output = command.output().map_err(|e| e.to_string())?;
    let result = serde_json::json!({"exitCode":output.status.code(),"stdout":String::from_utf8_lossy(&output.stdout),"stderr":String::from_utf8_lossy(&output.stderr)});
    if !output.status.success() { return Err(result.to_string()); }
    Ok(result)
}
fn main() {
    if let Err(error) = write_log("application_start".into(), serde_json::json!({})) { eprintln!("Ошибка записи лога: {error}"); }
    tauri::Builder::default().on_window_event(|window, event| {
        if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
            window.app_handle().exit(0);
        }
    }).invoke_handler(tauri::generate_handler![inventory, finish_startup, execute_command, write_log]).run(tauri::generate_context!()).expect("Ошибка запуска Minotaur");
}
