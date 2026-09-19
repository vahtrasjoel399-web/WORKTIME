import React, { useCallback, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, Title, Muted, Body, Card, Chip } from "@/components/ui";
import { useSession } from "@/state/session";
import { useTheme } from "@/theme/ThemeProvider";
import { font, radius, space } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { IS_DEMO } from "@/lib/config";
import { t } from "@/i18n";

type Assignment = {
  id: string;
  site_id: string;
  start_date: string;
  end_date: string | null;
};

type SiteSummary = {
  id: string;
  name: string;
  address: string | null;
};

function dateLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { profile, refreshProfile } = useSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sites, setSites] = useState<Record<string, SiteSummary>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile || IS_DEMO) {
      setAssignments([]);
      setSites({});
      setPhotoUrl(null);
      return;
    }

    const { data: assignmentRows } = await supabase
      .from("employee_assignments")
      .select("id, site_id, start_date, end_date")
      .eq("employee_id", profile.id)
      .order("start_date", { ascending: false });
    const nextAssignments = (assignmentRows ?? []) as Assignment[];
    setAssignments(nextAssignments);

    const siteIds = [...new Set(nextAssignments.map((assignment) => assignment.site_id))];
    if (profile.default_site_id && !siteIds.includes(profile.default_site_id)) siteIds.push(profile.default_site_id);
    if (siteIds.length > 0) {
      const { data: siteRows } = await supabase
        .from("sites")
        .select("id, name, address")
        .in("id", siteIds);
      setSites(Object.fromEntries(((siteRows ?? []) as SiteSummary[]).map((site) => [site.id, site])));
    } else {
      setSites({});
    }

    if (profile.profile_photo_path) {
      const { data } = await supabase.storage
        .from("employee-files")
        .createSignedUrl(profile.profile_photo_path, 3600);
      setPhotoUrl(data?.signedUrl ?? null);
    } else {
      setPhotoUrl(null);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await refreshProfile();
    await load();
    setRefreshing(false);
  }

  if (!profile) return <Screen><View /></Screen>;

  const currentAssignment = assignments.find((assignment) => assignment.end_date == null) ?? null;
  const currentSiteId = currentAssignment?.site_id ?? profile.default_site_id;
  const currentSite = currentSiteId ? sites[currentSiteId] : null;
  const initials = `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase() || "?";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.textMuted} />}
      >
        <Title>{t("profile.title")}</Title>

        <Card>
          <View style={styles.identity}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={[styles.avatar, { borderColor: theme.border }]} accessibilityLabel={t("profile.photo")} />
            ) : (
              <View style={[styles.avatar, styles.initials, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                <Body style={{ fontFamily: font.display, fontSize: 24 }}>{initials}</Body>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Body style={{ fontFamily: font.display, fontSize: 22 }}>{profile.first_name} {profile.last_name}</Body>
              <Muted style={{ marginTop: 4 }}>{profile.position || t("profile.positionMissing")}</Muted>
              <View style={{ marginTop: space(2) }}>
                <Chip label={profile.is_active ? t("profile.active") : t("profile.inactive")} color={profile.is_active ? theme.live : theme.textMuted} />
              </View>
            </View>
          </View>
        </Card>

        <Card>
          <Muted style={styles.sectionLabel}>{t("profile.personalInfo")}</Muted>
          <View style={styles.detailRow}><Muted>{t("profile.email")}</Muted><Body style={styles.detailValue}>{profile.email || "—"}</Body></View>
          <View style={styles.detailRow}><Muted>{t("profile.phone")}</Muted><Body style={styles.detailValue}>{profile.phone || "—"}</Body></View>
        </Card>

        <Card>
          <Muted style={styles.sectionLabel}>{t("profile.currentObject")}</Muted>
          {currentSite ? (
            <View style={{ gap: 4 }}>
              <Body style={{ fontFamily: font.textSemibold, fontSize: 18 }}>{currentSite.name}</Body>
              {currentSite.address && <Muted>{currentSite.address}</Muted>}
              {currentAssignment && <Muted>{t("profile.since", { date: dateLabel(currentAssignment.start_date) })}</Muted>}
            </View>
          ) : (
            <Muted>{t("profile.noObject")}</Muted>
          )}
        </Card>

        <View style={{ gap: space(2) }}>
          <Title style={{ fontSize: 20 }}>{t("profile.assignmentHistory")}</Title>
          {assignments.length === 0 && <Card><Muted>{t("profile.noHistory")}</Muted></Card>}
          {assignments.map((assignment, index) => {
            const site = sites[assignment.site_id];
            return (
              <Card key={assignment.id} index={index}>
                <View style={styles.historyHeader}>
                  <Body style={{ flex: 1, fontFamily: font.textSemibold }}>{site?.name ?? t("profile.unknownObject")}</Body>
                  {!assignment.end_date && <Chip label={t("profile.current")} color={theme.live} />}
                </View>
                {site?.address && <Muted style={{ marginTop: 4 }}>{site.address}</Muted>}
                <Muted style={{ marginTop: space(2) }}>
                  {dateLabel(assignment.start_date)} → {assignment.end_date ? dateLabel(assignment.end_date) : t("profile.present")}
                </Muted>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space(5), gap: space(4) },
  identity: { flexDirection: "row", alignItems: "center", gap: space(4) },
  avatar: { width: 76, height: 76, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  initials: { alignItems: "center", justifyContent: "center" },
  sectionLabel: { marginBottom: space(3), textTransform: "uppercase", letterSpacing: 0.7 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: space(4), paddingVertical: space(2) },
  detailValue: { flex: 1, textAlign: "right" },
  historyHeader: { flexDirection: "row", alignItems: "center", gap: space(3) },
});
