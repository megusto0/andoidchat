export function formatSimulationSender(
  name: string,
  isSimulation = false
): string {
  if (!isSimulation || name === "Server") {
    return name;
  }

  const suffix = name.match(/(\d{3})(?!.*\d)/)?.[1];
  return suffix ? `bot_${suffix}` : name;
}
