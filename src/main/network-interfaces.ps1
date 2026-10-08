$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$adapters = @(Get-NetAdapter -IncludeHidden)
$ipInterfaces = @(Get-NetIPInterface -ConnectionState Connected)
$routes = @(Get-NetRoute | Where-Object { $_.DestinationPrefix -in @('0.0.0.0/0', '::/0') })
$rows = @(
    foreach ($adapter in $adapters) {
        if ($adapter.Status.ToString() -ne 'Up') { continue }
        $ipRows = @($ipInterfaces | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex })
        $metrics = @(
            foreach ($route in $routes | Where-Object { $_.InterfaceIndex -eq $adapter.ifIndex }) {
                $ipRow = $ipRows | Where-Object { $_.AddressFamily -eq $route.AddressFamily } | Select-Object -First 1
                if ($null -ne $ipRow) { [int]$route.RouteMetric + [int]$ipRow.InterfaceMetric }
            }
        )
        [PSCustomObject]@{
            name = [string]$adapter.Name
            index = [int]$adapter.ifIndex
            physical = [bool]$adapter.HardwareInterface -and -not [bool]$adapter.Virtual
            defaultRoute = $metrics.Count -gt 0
            metric = if ($metrics.Count -gt 0) { [int]($metrics | Measure-Object -Minimum).Minimum } else { 2147483647 }
        }
    }
)
ConvertTo-Json -InputObject $rows -Compress -Depth 3
