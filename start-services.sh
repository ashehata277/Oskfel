#############################################
# FUNCTION: DETECT .NET 3 PROJECT (use dotnet64)
#############################################
is_dotnet3_project() {
    local service_dir="$1"
    local csproj
    csproj=$(find "$service_dir" -maxdepth 1 -name "*.csproj" 2>/dev/null | head -1)
    if [[ -z "$csproj" || ! -f "$csproj" ]]; then
        return 1
    fi
    grep -qE '<TargetFramework(s)?>[^<]*(netcoreapp3\.|net3\.)' "$csproj" 2>/dev/null
}

#############################################
# FUNCTION: TERMINAL COLORS PER SERVICE
#############################################
get_service_colors() {
    local service_name="$1"

    case "$service_name" in
        # Resources
        *Resources.API*|*Resources.Background*)
            echo "59367,65535,59367|0,0,0"
            ;;

        # Permissions
        *Permissions.API*|*Permissions.Background*)
            echo "65535,57311,57311|0,0,0"
            ;;

        # Customers
        *Customers.API*|*Customers.Background*)
            echo "65535,62965,49151|0,0,0"
            ;;

        # Jobs
        *Jobs.API*|*Jobs.Background*)
            echo "65535,65535,65535|0,0,0"
            ;;

        # Handover
        *HandoverService.API*|*HandoverService.Background*)
            echo "65535,55000,45000|0,0,0"
            ;;

        # Inspections
        *Inspections.API*|*Inspections.Background*)
            echo "56000,53000,65535|0,0,0"
            ;;

        # ActiveWork
        *ActiveWork.API*|*ActiveWork.Background*)
            echo "65535,62000,36000|0,0,0"
            ;;

        # Attendance
        *Attendance.API*|*Attendance.Background*)
            echo "50000,65535,65535|0,0,0"
            ;;

        # Materials
        *MaterialsService.API*|*MaterialsService.Background*)
            echo "61000,65535,52000|0,0,0"
            ;;

        # Report
        *Report.API*|*Report.Background*)
            echo "49000,49000,49000|65535,65535,65535"
            ;;

        # Notification
        *NotificationService.API*|*NotificationService.Background*)
            echo "65535,49000,59000|0,0,0"
            ;;

        # Forecasting
        *Forecasting.API*|*Forecasting.Background*)
            echo "65535,65535,43000|0,0,0"
            ;;

        # Gateway
        *Gateway.API*|*Gateway.Background*|*Intowork.Gateway*)
            echo "45000,56000,65535|0,0,0"
            ;;

        *)
            echo ""
            ;;
    esac
}

#############################################
# FUNCTION: RUN SERVICE IN NEW TERMINAL
#############################################
run_service() {
    local service_dir="$1"
    local url="$2"

    # Extract service name from directory path (e.g., "Intowork.Resources.API" from full path)
    local service_name
    service_name=$(basename "$service_dir")

    # Skip if service is in the except list
    if is_service_excluded "$service_name"; then
        echo "Skipping: $service_name"
        return 0
    fi

    # Use dotnet64 for .NET 3 projects, otherwise dotnet
    local dotnet_cmd="dotnet"
    if is_dotnet3_project "$service_dir"; then
        dotnet_cmd="dotnet64"
    fi

    # Resolve per-service terminal colors (background + foreground)
    local service_colors
    local terminal_bg_rgb=""
    local terminal_fg_rgb=""
    service_colors=$(get_service_colors "$service_name")
    if [[ -n "$service_colors" ]]; then
        terminal_bg_rgb="${service_colors%%|*}"
        terminal_fg_rgb="${service_colors##*|}"
    fi

    # Create a temp script that Terminal will execute
    local temp_script="/tmp/run_service_$$_$RANDOM.sh"

    cat > "$temp_script" <<EOF
#!/bin/zsh
source ~/.zshrc
# Use the correct .NET SDK location (supports .NET 10)
export DOTNET_ROOT="/usr/local/share/dotnet"
export PATH="/usr/local/share/dotnet:/opt/homebrew/bin:\$PATH"

cd "$service_dir"

echo "=============================="
echo "Running service:"
pwd
echo "Using: $dotnet_cmd"
echo "URL: $url"
echo "=============================="

$dotnet_cmd run --urls="$url"
EOF

    chmod +x "$temp_script"

    # Escape script path and service name for AppleScript
    local escaped_script
    escaped_script=$(printf "%s" "$temp_script" | sed 's/"/\\"/g')
    local escaped_service_name
    escaped_service_name=$(printf "%s" "$service_name" | sed 's/"/\\"/g')
    local escaped_terminal_bg_rgb
    escaped_terminal_bg_rgb=$(printf "%s" "$terminal_bg_rgb" | sed 's/"/\\"/g')
    local escaped_terminal_fg_rgb
    escaped_terminal_fg_rgb=$(printf "%s" "$terminal_fg_rgb" | sed 's/"/\\"/g')

    # Launch a new Terminal window and set its title
    osascript <<EOF
tell application "Terminal"
    set newWindow to do script "zsh \"$escaped_script\""
    set custom title of newWindow to "$escaped_service_name"
    if "$escaped_terminal_bg_rgb" is not "" and "$escaped_terminal_fg_rgb" is not "" then
        set background color of newWindow to {$escaped_terminal_bg_rgb}
        set normal text color of newWindow to {$escaped_terminal_fg_rgb}
    end if
end tell
EOF

    # Cleanup script after 10 seconds
    (sleep 10 && rm -f "$temp_script") &
}

#############################################
# FUNCTION: CHECK IF SERVICE SHOULD BE SKIPPED
#############################################
is_service_excluded() {
    local service_name="$1"
    local skip
    local IFS=','
    for skip in $EXCEPT_SERVICES; do
        skip="${skip// /}"
        if [[ "$service_name" == *"$skip"* ]]; then
            return 0
        fi
    done
    return 1
}

#############################################
# PARSE ARGUMENTS
#############################################
EXCEPT_SERVICES=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --except)
            EXCEPT_SERVICES="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

#############################################
# MAIN SERVICES EXECUTION
#############################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

run_service "$SCRIPT_DIR/ResourcesService/Intowork.Resources.API" "http://localhost:5000"
sleep 2

run_service "$SCRIPT_DIR/ResourcesService/Intowork.Resources.Background" "http://localhost:5100"
sleep 2

run_service "$SCRIPT_DIR/PermissionsService/Intowork.Permissions.API" "http://localhost:5001"
sleep 2

run_service "$SCRIPT_DIR/Gateway/Intowork.Gateway" "http://localhost:5002"
sleep 2

run_service "$SCRIPT_DIR/CustomerService/Intowork.Customers.API" "http://localhost:5003"
sleep 2

run_service "$SCRIPT_DIR/ProjectService/Intowork.Jobs.API" "http://localhost:5004"
sleep 2

run_service "$SCRIPT_DIR/ProjectService/Intowork.Jobs.BackgroundService" "http://localhost:5104"
sleep 2

run_service "$SCRIPT_DIR/HandoverService/Intowork.HandoverService.API" "http://localhost:5005"
sleep 2

run_service "$SCRIPT_DIR/HandoverService/Intowork.HandoverService.Background" "http://localhost:5105"
sleep 2

run_service "$SCRIPT_DIR/InspectionsService/Intowork.Inspections.API" "http://localhost:5006"
sleep 2

run_service "$SCRIPT_DIR/InspectionsService/Intowork.Inspections.Background" "http://localhost:5106"
sleep 2

run_service "$SCRIPT_DIR/ActiveWorkService/Intowork.ActiveWork.API" "http://localhost:5007"
sleep 2

run_service "$SCRIPT_DIR/ActiveWorkService/Intowork.ActiveWork.Background" "http://localhost:5107"
sleep 2

run_service "$SCRIPT_DIR/AttendanceService/Intowork.Attendance.API" "http://localhost:5008"
sleep 2

run_service "$SCRIPT_DIR/AttendanceService/Intowork.Attendance.Background" "http://localhost:5108"
sleep 2

run_service "$SCRIPT_DIR/MaterialsService/Intowork.MaterialsService.API" "http://localhost:5009"
sleep 2

run_service "$SCRIPT_DIR/ForecastingService/Intowork.Forecasting.API" "http://localhost:5010"
 sleep 2

run_service "$SCRIPT_DIR/ForecastingService/Intowork.Forecasting.Background" "http://localhost:5110"
 sleep 2

run_service "$SCRIPT_DIR/FrameworkCache/Intowork.Report.API" "http://localhost:5011"
sleep 2

run_service "$SCRIPT_DIR/NotificationService/Intowork.NotificationService.API" "http://localhost:5012"
