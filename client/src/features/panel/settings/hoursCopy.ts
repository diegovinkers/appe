import { useLanguage } from "../../../i18n";

const pt = {
  title: "Horários", description: "Defina quando sua loja recebe pedidos e ajuste feriados ou datas especiais.",
  weekly: "Horário semanal", weeklyHelp: "Até 4 turnos por dia, no horário de Brasília (America/Sao_Paulo).",
  timeHelp: "Um fechamento anterior à abertura termina no dia seguinte. Use 24:00 para fechar à meia-noite.",
  activeDay: "Atende neste dia", closed: "Fechado", open: "Abre às", close: "Fecha às", midnight: "Fechar à meia-noite (24:00)",
  overnight: "Termina no dia seguinte", addInterval: "Adicionar turno", removeInterval: "Remover turno", interval: "Turno",
  copyFrom: "Copiar de outro dia", copyPlaceholder: "Escolher dia…", copy: "Copiar horários", copyConfirm: "Substituir os horários deste dia pelos horários do dia selecionado?",
  exceptions: "Feriados e datas especiais", exceptionsHelp: "Estas datas substituem o horário semanal. Os turnos iniciados no dia anterior continuam até o fechamento informado. Datas passadas são removidas ao salvar.",
  noExceptions: "Nenhuma data especial. A loja seguirá o horário semanal.", addException: "Adicionar data", removeException: "Remover data", removeExceptionConfirm: "Remover esta data especial? O horário semanal voltará a valer nessa data.",
  date: "Data", note: "Observação (opcional)", notePlaceholder: "Ex.: feriado municipal", specialHours: "Atende nesta data", closedDate: "Fechado nesta data",
  maxExceptions: "Limite de 60 datas especiais atingido.", noWeekly: "Sem turnos semanais, a loja só recebe pedidos nas datas especiais abertas ou quando aberta manualmente.",
  statusTitle: "Como a loja está agora", automatic: "O estado atual segue os horários salvos.", manual: "Há um ajuste manual ativo. Salvar os horários não remove esse ajuste. Use o controle de abertura no topo para voltar ao horário automático.",
  manualUntil: "Ajuste manual válido até", manualIndefinite: "Sem término definido: permanece até você voltar ao horário automático.", pausedHelp: "Durante a pausa, novos pedidos ficam bloqueados. Ao terminar, o horário salvo volta a valer.",
  save: "Salvar horários", saving: "Salvando…", discard: "Descartar alterações", discardConfirm: "Descartar todas as alterações de horários que ainda não foram salvas?",
  saved: "Horários salvos.", unsaved: "Alterações não salvas", correctErrors: "Revise os campos indicados antes de salvar.",
  invalidTime: "Informe um horário válido no formato HH:MM.", sameTime: "A abertura e o fechamento não podem ser iguais. Para 24 horas, use 00:00–24:00.",
  overlap: "Os turnos deste dia se sobrepõem. Ajuste os horários.", invalidDate: "Escolha uma data válida de hoje em diante.", duplicateDate: "Esta data já está cadastrada.",
  emptyIntervals: "Informe pelo menos um turno ou marque a data como fechada.", tooManyIntervals: "Cada dia pode ter até 4 turnos.", longNote: "Use no máximo 60 caracteres.",
  loading: "Carregando horários…", retry: "Tentar novamente", copied: "Horários copiados. Salve para aplicar.",
  days: { mon: "Segunda-feira", tue: "Terça-feira", wed: "Quarta-feira", thu: "Quinta-feira", fri: "Sexta-feira", sat: "Sábado", sun: "Domingo" },
};

type Copy = { [K in keyof typeof pt]: K extends "days" ? Record<keyof typeof pt.days, string> : string };
const es: Copy = {
  title: "Horarios", description: "Definí cuándo recibe pedidos tu local y ajustá feriados o fechas especiales.",
  weekly: "Horario semanal", weeklyHelp: "Hasta 4 turnos por día, en el horario de Brasilia (America/Sao_Paulo).",
  timeHelp: "Un cierre anterior a la apertura termina al día siguiente. Usá 24:00 para cerrar a medianoche.",
  activeDay: "Atiende este día", closed: "Cerrado", open: "Abre a las", close: "Cierra a las", midnight: "Cerrar a medianoche (24:00)",
  overnight: "Termina al día siguiente", addInterval: "Agregar turno", removeInterval: "Quitar turno", interval: "Turno",
  copyFrom: "Copiar de otro día", copyPlaceholder: "Elegir día…", copy: "Copiar horarios", copyConfirm: "¿Reemplazar los horarios de este día por los del día seleccionado?",
  exceptions: "Feriados y fechas especiales", exceptionsHelp: "Estas fechas reemplazan el horario semanal. Los turnos iniciados el día anterior continúan hasta su hora de cierre. Las fechas pasadas se eliminan al guardar.",
  noExceptions: "No hay fechas especiales. El local seguirá el horario semanal.", addException: "Agregar fecha", removeException: "Quitar fecha", removeExceptionConfirm: "¿Quitar esta fecha especial? El horario semanal volverá a aplicarse en esa fecha.",
  date: "Fecha", note: "Observación (opcional)", notePlaceholder: "Ej.: feriado local", specialHours: "Atiende esta fecha", closedDate: "Cerrado en esta fecha",
  maxExceptions: "Se alcanzó el límite de 60 fechas especiales.", noWeekly: "Sin turnos semanales, el local solo recibe pedidos en las fechas especiales abiertas o cuando lo abras manualmente.",
  statusTitle: "Cómo está el local ahora", automatic: "El estado actual sigue los horarios guardados.", manual: "Hay un ajuste manual activo. Guardar los horarios no quita ese ajuste. Usá el control de apertura de arriba para volver al horario automático.",
  manualUntil: "Ajuste manual válido hasta", manualIndefinite: "Sin final definido: se mantiene hasta que vuelvas al horario automático.", pausedHelp: "Durante la pausa no se reciben pedidos nuevos. Al terminar, vuelve a aplicarse el horario guardado.",
  save: "Guardar horarios", saving: "Guardando…", discard: "Descartar cambios", discardConfirm: "¿Descartar todos los cambios de horarios que todavía no se guardaron?",
  saved: "Horarios guardados.", unsaved: "Cambios sin guardar", correctErrors: "Revisá los campos indicados antes de guardar.",
  invalidTime: "Ingresá un horario válido con formato HH:MM.", sameTime: "La apertura y el cierre no pueden coincidir. Para 24 horas, usá 00:00–24:00.",
  overlap: "Los turnos de este día se superponen. Ajustá los horarios.", invalidDate: "Elegí una fecha válida de hoy en adelante.", duplicateDate: "Esta fecha ya está registrada.",
  emptyIntervals: "Ingresá al menos un turno o marcá la fecha como cerrada.", tooManyIntervals: "Cada día puede tener hasta 4 turnos.", longNote: "Usá como máximo 60 caracteres.",
  loading: "Cargando horarios…", retry: "Reintentar", copied: "Horarios copiados. Guardá para aplicar.",
  days: { mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo" },
};

export const useHoursCopy = (): Copy => useLanguage() === "es" ? es : pt;
export type HoursCopy = Copy;
